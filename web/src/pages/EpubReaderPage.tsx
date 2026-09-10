import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { ShellContext } from '../CookbookShell';
import {
  checkDuplicates,
  createEpubBookmark,
  createRecipe,
  deleteEpubBookmark,
  getCuisines,
  getEpubChapterBlocks,
  getEpubChapterHtml,
  getEpubSource,
  getMealTypes,
  listEpubBookmarks,
  parseManualPaste
} from '../api/client';
import { EpubBlock, EpubBookmark, EpubChapterSummary, EpubSourceDetail, MetaItem, RecipeDraft, RecipeInput } from '../api/types';
import { RecipeDraftEditor } from '../components/RecipeDraftEditor';

type Coord = { flowIndex: number; blockIndex: number };

function compareCoord(a: Coord, b: Coord): number {
  return a.flowIndex - b.flowIndex || a.blockIndex - b.blockIndex;
}

function chapterTitle(source: EpubSourceDetail | null, flowIndex: number): string {
  return source?.chapters[flowIndex]?.title ?? `Chapter ${flowIndex + 1}`;
}

function bookmarkRangeLabel(source: EpubSourceDetail | null, bookmark: EpubBookmark): string {
  if (bookmark.startFlowIndex === bookmark.endFlowIndex) {
    return chapterTitle(source, bookmark.startFlowIndex);
  }
  return `${chapterTitle(source, bookmark.startFlowIndex)} → ${chapterTitle(source, bookmark.endFlowIndex)}`;
}

function chapterAnchorId(flowIndex: number): string {
  return `epub-chapter-${flowIndex}`;
}

// Fetches every chapter's rendered HTML up front (bounded concurrency,
// since a page-per-spine-item book can easily have a couple hundred tiny
// "chapters") so the whole book can render as one continuous scrollable
// document -- closer to how Preview/Books show an EPUB, images and all --
// instead of forcing a click-through-one-chapter-at-a-time UI. onEach
// fires as each chapter resolves so the UI can show incremental progress
// rather than one long blank wait.
async function loadAllChapterHtml(
  sourceId: number,
  chapters: EpubChapterSummary[],
  onEach: (flowIndex: number, html: string) => void
): Promise<void> {
  const CONCURRENCY = 6;
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < chapters.length) {
      const chapter = chapters[nextIndex++];
      try {
        const html = await getEpubChapterHtml(sourceId, chapter.flowIndex);
        onEach(chapter.flowIndex, html);
      } catch {
        // One bad chapter (malformed markup, etc.) shouldn't block the
        // rest of the book from loading -- treat it as empty.
        onEach(chapter.flowIndex, '<p class="muted">Failed to load this page.</p>');
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, chapters.length) }, worker));
}

// Resolves a DOM click (delegated on the reading pane, since chapter
// content is raw HTML rather than per-block JSX) back to the same
// {flowIndex, blockIndex} coordinates the block-based bookmark model uses.
function coordFromElement(el: Element | null): Coord | null {
  const blockEl = el?.closest('[data-block-index]');
  const chapterEl = blockEl?.closest('[data-flow-index]');
  if (!blockEl || !chapterEl) return null;
  const blockIndex = Number((blockEl as HTMLElement).dataset.blockIndex);
  const flowIndex = Number((chapterEl as HTMLElement).dataset.flowIndex);
  if (!Number.isFinite(blockIndex) || !Number.isFinite(flowIndex)) return null;
  return { flowIndex, blockIndex };
}

// Joins block *text* (not the rendered HTML) across the (possibly
// multi-chapter) range a bookmark spans, in original document order, for
// feeding into parseManualPaste -- fetched separately and lazily from the
// bulk-loaded HTML above, since extraction only happens per-bookmark on
// demand and needs plain text, not markup.
async function resolveBookmarkText(
  sourceId: number,
  bookmark: EpubBookmark,
  blocksByChapter: Map<number, EpubBlock[]>
): Promise<string> {
  const parts: string[] = [];
  for (let flowIndex = bookmark.startFlowIndex; flowIndex <= bookmark.endFlowIndex; flowIndex++) {
    let blocks = blocksByChapter.get(flowIndex);
    if (!blocks) {
      blocks = await getEpubChapterBlocks(sourceId, flowIndex);
      blocksByChapter.set(flowIndex, blocks);
    }
    const from = flowIndex === bookmark.startFlowIndex ? bookmark.startBlockIndex : 0;
    const to = flowIndex === bookmark.endFlowIndex ? bookmark.endBlockIndex : blocks.length - 1;
    for (const block of blocks) {
      if (block.index >= from && block.index <= to) parts.push(block.text);
    }
  }
  return parts.join('\n\n');
}

export function EpubReaderPage() {
  const { id } = useParams<{ id: string }>();
  const sourceId = Number(id);
  const navigate = useNavigate();
  const { bumpReload } = useOutletContext<ShellContext>();

  const [source, setSource] = useState<EpubSourceDetail | null>(null);
  const [htmlByChapter, setHtmlByChapter] = useState<Map<number, string>>(new Map());
  const [htmlLoadedCount, setHtmlLoadedCount] = useState(0);
  // Purely for bookmark extraction (plain text for parseManualPaste) --
  // fetched lazily per-bookmark, never bulk-loaded like htmlByChapter.
  const [blocksByChapter, setBlocksByChapter] = useState<Map<number, EpubBlock[]>>(new Map());
  const [bookmarks, setBookmarks] = useState<EpubBookmark[]>([]);
  const paneRef = useRef<HTMLDivElement>(null);
  const [rangeStart, setRangeStart] = useState<Coord | null>(null);
  const [rangeEnd, setRangeEnd] = useState<Coord | null>(null);
  const [bookmarkTitleInput, setBookmarkTitleInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState<number | null>(null);
  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [mealTypes, setMealTypes] = useState<MetaItem[]>([]);
  const [cuisines, setCuisines] = useState<MetaItem[]>([]);

  useEffect(() => {
    Promise.all([getMealTypes(), getCuisines()]).then(([mt, c]) => {
      setMealTypes(mt);
      setCuisines(c);
    });
  }, []);

  useEffect(() => {
    if (!sourceId) return;
    let cancelled = false;
    setSource(null);
    setHtmlByChapter(new Map());
    setHtmlLoadedCount(0);
    setBlocksByChapter(new Map());
    setRangeStart(null);
    setRangeEnd(null);

    getEpubSource(sourceId).then((detail) => {
      if (cancelled) return;
      setSource(detail);
      loadAllChapterHtml(sourceId, detail.chapters, (flowIndex, html) => {
        if (cancelled) return;
        setHtmlByChapter((prev) => new Map(prev).set(flowIndex, html));
        setHtmlLoadedCount((n) => n + 1);
      });
    });
    listEpubBookmarks(sourceId).then((list) => {
      if (!cancelled) setBookmarks(list);
    });

    return () => {
      cancelled = true;
    };
  }, [sourceId]);

  const fullyLoaded = source !== null && htmlLoadedCount >= source.chapters.length;

  const handleBlockClick = (clicked: Coord) => {
    if (!rangeStart || (rangeStart && rangeEnd)) {
      setRangeStart(clicked);
      setRangeEnd(null);
      return;
    }
    // rangeStart set, rangeEnd not yet
    if (compareCoord(clicked, rangeStart) < 0) {
      setRangeStart(clicked);
    } else {
      setRangeEnd(clicked);
    }
  };

  const handlePaneClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const coord = coordFromElement(e.target as Element);
    if (coord) handleBlockClick(coord);
  };

  const clearSelection = () => {
    setRangeStart(null);
    setRangeEnd(null);
    setBookmarkTitleInput('');
  };

  const isInSelection = (coord: Coord): boolean => {
    if (!rangeStart) return false;
    const end = rangeEnd ?? rangeStart;
    return compareCoord(coord, rangeStart) >= 0 && compareCoord(coord, end) <= 0;
  };

  // The reading pane's content is raw HTML (dangerouslySetInnerHTML), not
  // React-owned elements, so selection highlighting is applied imperatively
  // via direct DOM classList toggles instead of conditional JSX classNames.
  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;
    const nodes = pane.querySelectorAll<HTMLElement>('[data-block-index]');
    nodes.forEach((el) => {
      const chapterEl = el.closest<HTMLElement>('[data-flow-index]');
      const flowIndex = chapterEl ? Number(chapterEl.dataset.flowIndex) : NaN;
      const blockIndex = Number(el.dataset.blockIndex);
      if (!Number.isFinite(flowIndex) || !Number.isFinite(blockIndex)) return;
      const coord: Coord = { flowIndex, blockIndex };
      el.classList.toggle('epub-block-selected', isInSelection(coord));
      el.classList.toggle(
        'epub-block-range-start',
        rangeStart?.flowIndex === flowIndex && rangeStart.blockIndex === blockIndex
      );
      el.classList.toggle(
        'epub-block-range-end',
        rangeEnd?.flowIndex === flowIndex && rangeEnd.blockIndex === blockIndex
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeStart, rangeEnd, htmlByChapter]);

  const handleSaveBookmark = async () => {
    if (!sourceId || !rangeStart || !rangeEnd) return;
    setError(null);
    try {
      const bookmark = await createEpubBookmark(sourceId, {
        title: bookmarkTitleInput.trim() || null,
        startFlowIndex: rangeStart.flowIndex,
        startBlockIndex: rangeStart.blockIndex,
        endFlowIndex: rangeEnd.flowIndex,
        endBlockIndex: rangeEnd.blockIndex
      });
      setBookmarks((prev) => [...prev, bookmark].sort(compareBookmarks));
      clearSelection();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save bookmark.');
    }
  };

  const handleDeleteBookmark = async (bookmarkId: number) => {
    await deleteEpubBookmark(bookmarkId);
    setBookmarks((prev) => prev.filter((b) => b.id !== bookmarkId));
  };

  const handleExtractBookmark = async (bookmark: EpubBookmark) => {
    if (!sourceId) return;
    setError(null);
    setExtracting(bookmark.id);
    try {
      const cache = new Map(blocksByChapter);
      const text = await resolveBookmarkText(sourceId, bookmark, cache);
      setBlocksByChapter(cache);
      if (!text.trim()) {
        setError('That bookmark has no text in its range.');
        return;
      }
      const parsed = await parseManualPaste(text);
      setDraft(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to extract that bookmark.');
    } finally {
      setExtracting(null);
    }
  };

  const handleSave = async (input: RecipeInput) => {
    const matches = await checkDuplicates(null, input.title);
    if (matches.length > 0) {
      const names = matches.map((m) => (m.sourceName ? `"${m.title}" (${m.sourceName})` : `"${m.title}"`)).join(', ');
      const proceed = window.confirm(
        `This might already be in your cookbook: ${names}. Save this as a new recipe anyway?`
      );
      if (!proceed) return;
    }
    const recipe = await createRecipe({ ...input, sourceType: 'epub', sourceRef: null });
    bumpReload();
    navigate(`/recipes/${recipe.id}`);
  };

  const selectionSpansChapters = rangeStart && rangeEnd && rangeStart.flowIndex !== rangeEnd.flowIndex;

  const sortedBookmarks = useMemo(() => [...bookmarks].sort(compareBookmarks), [bookmarks]);

  if (draft) {
    return (
      <div className="detail-panel">
        <RecipeDraftEditor
          initial={{
            ...draft,
            sourceType: 'epub',
            sourceRef: null,
            sourceName: draft.sourceName ?? source?.title ?? source?.filename ?? null,
            mealTypeIds: [],
            cuisineNames: draft.cuisineNames ?? []
          }}
          mealTypes={mealTypes}
          cuisineSuggestions={cuisines}
          onSave={handleSave}
          onCancel={() => setDraft(null)}
        />
      </div>
    );
  }

  return (
    <div className="detail-panel epub-reader">
      <h1>{source?.title || source?.filename || 'Loading...'}</h1>
      {source?.author && <div className="muted">{source.author}</div>}
      {error && <div className="editor-error">{error}</div>}

      <div className="epub-reader-layout">
        <nav className="epub-chapter-list">
          {source?.chapters.map((chapter) => (
            <button
              key={chapter.flowIndex}
              type="button"
              className="epub-chapter-item"
              onClick={() =>
                document.getElementById(chapterAnchorId(chapter.flowIndex))?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'start'
                })
              }
            >
              {chapter.title}
            </button>
          ))}
        </nav>

        <div className="epub-block-pane" ref={paneRef} onClick={handlePaneClick}>
          {!source ? (
            <div className="muted">Loading...</div>
          ) : !fullyLoaded ? (
            <div className="muted">
              Loading book... ({htmlLoadedCount} of {source.chapters.length} chapters)
            </div>
          ) : (
            <div className="epub-block-list">
              {source.chapters.map((chapter) => (
                <div key={chapter.flowIndex} id={chapterAnchorId(chapter.flowIndex)} className="epub-chapter-section">
                  <div className="epub-chapter-heading">{chapter.title}</div>
                  <div
                    className="epub-chapter-html"
                    data-flow-index={chapter.flowIndex}
                    dangerouslySetInnerHTML={{ __html: htmlByChapter.get(chapter.flowIndex) ?? '' }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="epub-bookmark-pane">
          <div className="epub-bookmark-form">
            <h3>Bookmark this recipe</h3>
            {!rangeStart && <div className="muted">Click where the recipe starts, then where it ends.</div>}
            {rangeStart && !rangeEnd && (
              <div className="muted">
                Start marked in "{chapterTitle(source, rangeStart.flowIndex)}" — now scroll and click where it ends.
              </div>
            )}
            {rangeStart && rangeEnd && (
              <>
                {selectionSpansChapters && (
                  <div className="muted">
                    Spans "{chapterTitle(source, rangeStart.flowIndex)}" → "{chapterTitle(source, rangeEnd.flowIndex)}"
                  </div>
                )}
                <label className="field">
                  <span>Bookmark title (optional)</span>
                  <input
                    value={bookmarkTitleInput}
                    onChange={(e) => setBookmarkTitleInput(e.target.value)}
                    placeholder="e.g. the recipe's title"
                  />
                </label>
                <div className="editor-actions">
                  <button type="button" onClick={handleSaveBookmark}>
                    Save bookmark
                  </button>
                  <button type="button" className="secondary" onClick={clearSelection}>
                    Cancel selection
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="epub-bookmark-list">
            <h3>Bookmarks</h3>
            {sortedBookmarks.length === 0 ? (
              <div className="muted">No bookmarks yet.</div>
            ) : (
              <ul>
                {sortedBookmarks.map((bookmark) => (
                  <li key={bookmark.id} className="epub-bookmark-item">
                    <div className="epub-bookmark-title">{bookmark.title || 'Untitled bookmark'}</div>
                    <div className="muted epub-bookmark-range">{bookmarkRangeLabel(source, bookmark)}</div>
                    <div className="editor-actions">
                      <button
                        type="button"
                        onClick={() => handleExtractBookmark(bookmark)}
                        disabled={extracting === bookmark.id}
                      >
                        {extracting === bookmark.id ? 'Extracting...' : 'Extract'}
                      </button>
                      <button type="button" className="secondary" onClick={() => handleDeleteBookmark(bookmark.id)}>
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function compareBookmarks(a: EpubBookmark, b: EpubBookmark): number {
  return a.startFlowIndex - b.startFlowIndex || a.startBlockIndex - b.startBlockIndex;
}
