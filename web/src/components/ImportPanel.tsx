import { useEffect, useState } from 'react';
import { checkDuplicates, createRecipe, fetchRecipeFromUrl, getCuisines, getMealTypes, parseManualPaste } from '../api/client';
import { MetaItem, RecipeDraft, RecipeInput, SourceType } from '../api/types';
import { RecipeDraftEditor } from './RecipeDraftEditor';

type ImportPanelProps = {
  onCreated: (recipeId: number) => void;
  onCancel: () => void;
};

// YouTube (including Shorts) exposes thumbnails at a predictable URL keyed
// by video ID — no page fetch needed. Video pages don't carry Recipe
// JSON-LD anyway, so this is the one useful thing to auto-fill; the recipe
// text itself still has to be pasted in below, same as Instagram.
function extractYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^(www|m)\./i, '').toLowerCase();
    if (hostname === 'youtu.be') {
      return parsed.pathname.slice(1).split('/')[0] || null;
    }
    if (hostname === 'youtube.com') {
      const shortsMatch = parsed.pathname.match(/^\/shorts\/([^/?]+)/);
      if (shortsMatch) return shortsMatch[1];
      return parsed.searchParams.get('v');
    }
    return null;
  } catch {
    return null;
  }
}

function youtubeThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
}

export function ImportPanel({ onCreated, onCancel }: ImportPanelProps) {
  const [pasteText, setPasteText] = useState('');
  const [fetchUrl, setFetchUrl] = useState('');
  const [sourceType, setSourceType] = useState<SourceType>('manual');
  const [sourceRef, setSourceRef] = useState('');
  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [mealTypes, setMealTypes] = useState<MetaItem[]>([]);
  const [cuisines, setCuisines] = useState<MetaItem[]>([]);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetchNotice, setFetchNotice] = useState<string | null>(null);
  const [prefilledImageUrl, setPrefilledImageUrl] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getMealTypes(), getCuisines()]).then(([mt, c]) => {
      setMealTypes(mt);
      setCuisines(c);
    });
  }, []);

  const handleParse = async () => {
    if (!pasteText.trim()) return;
    const parsed = await parseManualPaste(pasteText);
    setDraft(parsed);
  };

  const handleFetch = async () => {
    const url = fetchUrl.trim();
    if (!url) return;
    setFetchError(null);
    setFetchNotice(null);
    setPrefilledImageUrl(null);

    let hostname = '';
    try {
      hostname = new URL(url).hostname.toLowerCase();
    } catch {
      setFetchError('That doesn\'t look like a valid link. Try pasting the recipe text instead.');
      return;
    }

    // Instagram is login-gated and JS-rendered — there's no page to fetch and
    // extract from, so skip straight to "paste the text" rather than trying
    // and failing.
    if (hostname.includes('instagram.com')) {
      setSourceType('instagram');
      setSourceRef(url);
      setFetchNotice("Instagram can't be auto-fetched — paste the recipe text below and I'll structure it.");
      return;
    }

    // YouTube/Shorts pages don't carry Recipe JSON-LD either, so there's
    // nothing structured to fetch — but the thumbnail is grabbable without
    // fetching the page at all, so pre-fill that while asking for the text.
    const youtubeVideoId = extractYouTubeVideoId(url);
    if (youtubeVideoId) {
      setSourceType('website');
      setSourceRef(url);
      setPrefilledImageUrl(youtubeThumbnailUrl(youtubeVideoId));
      setFetchNotice(
        "YouTube can't be auto-fetched — paste the recipe text below and I'll structure it. Grabbed the video thumbnail for you."
      );
      return;
    }

    setFetching(true);
    try {
      const result = await fetchRecipeFromUrl(url);
      setSourceType('website');
      setSourceRef(url);
      setDraft(result);
      if (!result.usedStructuredData) {
        setFetchNotice(
          "This page didn't have structured recipe data — split from the page text instead, so double-check it carefully."
        );
      }
    } catch (err) {
      setFetchError(
        err instanceof Error
          ? `${err.message}. Try pasting the recipe text instead.`
          : 'Failed to fetch that page. Try pasting the recipe text instead.'
      );
    } finally {
      setFetching(false);
    }
  };

  const handleSave = async (input: RecipeInput) => {
    const finalSourceRef = sourceRef.trim() || null;
    const matches = await checkDuplicates(finalSourceRef, input.title);
    if (matches.length > 0) {
      const names = matches.map((m) => (m.sourceName ? `"${m.title}" (${m.sourceName})` : `"${m.title}"`)).join(', ');
      const proceed = window.confirm(
        `This might already be in your cookbook: ${names}. Save this as a new recipe anyway?`
      );
      if (!proceed) return;
    }
    const recipe = await createRecipe({ ...input, sourceType, sourceRef: finalSourceRef });
    onCreated(recipe.id);
  };

  return (
    <div className="detail-panel">
      <h1>Add a recipe</h1>

      {!draft ? (
        <div className="import-paste-box">
          <label className="field">
            <span>Paste a website, Instagram, or YouTube link</span>
            <input
              value={fetchUrl}
              onChange={(e) => setFetchUrl(e.target.value)}
              placeholder="https://..."
            />
          </label>
          {fetchError && <div className="editor-error">{fetchError}</div>}
          {fetchNotice && <div className="editor-notice">{fetchNotice}</div>}
          <div className="editor-actions">
            <button type="button" onClick={handleFetch} disabled={fetching}>
              {fetching ? 'Fetching...' : 'Fetch recipe'}
            </button>
            <button type="button" className="secondary" disabled title="EPUB import isn't built yet">
              + Add from EPUB (coming soon)
            </button>
          </div>

          <div className="import-divider">— or paste the recipe text directly —</div>

          <label className="field">
            <span>Paste recipe text</span>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={12}
              placeholder={'Title\n\nIngredients:\n1 cup flour\n...\n\nInstructions:\n1. Mix...\n...'}
            />
          </label>
          <div className="editor-actions">
            <button type="button" onClick={handleParse}>
              Parse recipe
            </button>
            <button type="button" className="secondary" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          {fetchNotice && <div className="editor-notice">{fetchNotice}</div>}
          <RecipeDraftEditor
            initial={{
              ...draft,
              sourceType,
              sourceRef,
              mealTypeIds: [],
              cuisineNames: draft.cuisineNames ?? [],
              imageUrl: draft.imageUrl ?? prefilledImageUrl
            }}
            mealTypes={mealTypes}
            cuisineSuggestions={cuisines}
            onSave={handleSave}
            onCancel={() => setDraft(null)}
          />
        </>
      )}
    </div>
  );
}
