import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { ShellContext } from '../CookbookShell';
import {
  checkDuplicates,
  createEpubBookmark,
  createRecipe,
  deleteEpubBookmark,
  getCuisines,
  getEpubChapterBlocks,
  getEpubSource,
  getMealTypes,
  listEpubBookmarks,
  parseManualPaste
} from '../api/client';
import { EpubBlock, EpubBookmark, EpubSourceDetail, MetaItem, RecipeDraft, RecipeInput } from '../api/types';
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

// Joins block text across the (possibly multi-chapter) range a bookmark
// spans, in original document order, fetching whichever chapters aren't
// already cached in `blocksByChapter`.
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
  const [flowIndex, setFlowIndex] = useState(0);
  const [blocksByChapter, setBlocksByChapter] = useState<Map<number, EpubBlock[]>>(new Map());
  const [loadingBlocks, setLoadingBlocks] = useState(false);
  const [bookmarks, setBookmarks] = useState<EpubBookmark[]>([]);
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
    getEpubSource(sourceId).then(setSource);
    listEpubBookmarks(sourceId).then(setBookmarks);
    setFlowIndex(0);
    setBlocksByChapter(new Map());
    setRangeStart(null);
    setRangeEnd(null);
  }, [sourceId]);

  const blocks = blocksByChapter.get(flowIndex) ?? null;

  useEffect(() => {
    if (!sourceId || blocksByChapter.has(flowIndex)) return;
    setLoadingBlocks(true);
    getEpubChapterBlocks(sourceId, flowIndex)
      .then((fetched) => {
        setBlocksByChapter((prev) => new Map(prev).set(flowIndex, fetched));
      })
      .finally(() => setLoadingBlocks(false));
  }, [sourceId, flowIndex, blocksByChapter]);

  const handleBlockClick = (blockIndex: number) => {
    const clicked: Coord = { flowIndex, blockIndex };
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

  const clearSelection = () => {
    setRangeStart(null);
    setRangeEnd(null);
    setBookmarkTitleInput('');
  };

  const isInSelection = (blockIndex: number): boolean => {
    if (!rangeStart) return false;
    const coord: Coord = { flowIndex, blockIndex };
    const end = rangeEnd ?? rangeStart;
    return compareCoord(coord, rangeStart) >= 0 && compareCoord(coord, end) <= 0;
  };

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
              className={`epub-chapter-item${chapter.flowIndex === flowIndex ? ' epub-chapter-item-active' : ''}`}
              onClick={() => setFlowIndex(chapter.flowIndex)}
            >
              {chapter.title}
            </button>
          ))}
        </nav>

        <div className="epub-block-pane">
          {loadingBlocks || !blocks ? (
            <div className="muted">Loading chapter...</div>
          ) : blocks.length === 0 ? (
            <div className="muted">This chapter has no readable text.</div>
          ) : (
            <div className="epub-block-list">
              {blocks.map((block) => {
                const selected = isInSelection(block.index);
                const isStart = rangeStart?.flowIndex === flowIndex && rangeStart.blockIndex === block.index;
                const isEnd = rangeEnd?.flowIndex === flowIndex && rangeEnd.blockIndex === block.index;
                return (
                  <div
                    key={block.index}
                    className={`epub-block epub-block-${block.tag}${selected ? ' epub-block-selected' : ''}`}
                    onClick={() => handleBlockClick(block.index)}
                  >
                    {isStart && <span className="epub-block-marker">start</span>}
                    {isEnd && <span className="epub-block-marker">end</span>}
                    {block.text}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="epub-bookmark-pane">
          <div className="epub-bookmark-form">
            <h3>Bookmark this recipe</h3>
            {!rangeStart && <div className="muted">Click where the recipe starts, then where it ends.</div>}
            {rangeStart && !rangeEnd && (
              <div className="muted">
                Start marked in "{chapterTitle(source, rangeStart.flowIndex)}" — now click where it ends
                {rangeStart.flowIndex !== flowIndex ? ' (you can switch chapters first)' : ''}.
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
