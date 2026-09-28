import { useEffect, useState } from 'react';
import { checkDuplicates, createRecipe, fetchRecipeFromUrl, getCuisines, getMealTypes, parseManualPaste } from '../api/client';
import { MetaItem, RecipeDraft, RecipeInput, SourceType } from '../api/types';
import {
  deriveSourceNameFromUrl,
  extractYouTubeVideoId,
  isInstagramUrl,
  isUnfetchableRecipeUrl,
  youtubeThumbnailUrl
} from '../sourceUrl';
import { RecipeDraftEditor } from './RecipeDraftEditor';
import { Button, ButtonLink } from './Button';
import { useAuth } from '../auth/AuthContext';

type ImportPanelProps = {
  onCreated: (recipeId: number) => void;
  onCancel: () => void;
};

// Was a placeholder (grayed-out hint text that just vanishes on focus/
// typing) -- real starter text instead, so it's actually there to select-
// all-and-paste-over or edit in place, not something that disappears the
// moment you click into the box.
const PASTE_TEMPLATE = 'Title:\n\nSource:\n\nIngredients (use - for section names)\n\nInstructions';

export function ImportPanel({ onCreated, onCancel }: ImportPanelProps) {
  const { user } = useAuth();
  const [pasteText, setPasteText] = useState(PASTE_TEMPLATE);
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
    // Untouched template text isn't real content any more than an empty
    // box was before this became real starter text instead of a placeholder.
    if (!pasteText.trim() || pasteText === PASTE_TEMPLATE) return;
    const parsed = await parseManualPaste(pasteText);
    // A URL pasted as part of the recipe text itself (rather than typed
    // into the separate field above) becomes the source link automatically
    // -- but don't clobber a link the user already entered up top.
    if (parsed.sourceRef && !sourceRef.trim()) {
      setSourceRef(parsed.sourceRef);
      setSourceType(isInstagramUrl(parsed.sourceRef) ? 'instagram' : 'website');
    }
    setDraft(parsed);
  };

  const handleFetch = async () => {
    const url = fetchUrl.trim();
    if (!url) return;
    setFetchError(null);
    setFetchNotice(null);
    setPrefilledImageUrl(null);

    try {
      new URL(url);
    } catch {
      setFetchError('That doesn\'t look like a valid link. Try pasting the recipe text instead.');
      return;
    }

    // Instagram is login-gated and JS-rendered — there's no page to fetch and
    // extract from, so skip straight to "paste the text" rather than trying
    // and failing.
    if (isInstagramUrl(url)) {
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

    // Other sites confirmed not to hand back usable structured data (see
    // KNOWN_UNFETCHABLE_HOSTNAMES in sourceUrl.ts) -- skip straight to
    // "paste the text" instead of attempting a fetch that's already known
    // to fail.
    if (isUnfetchableRecipeUrl(url)) {
      setSourceType('website');
      setSourceRef(url);
      setFetchNotice("This site can't be auto-fetched — paste the recipe text below and I'll structure it.");
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

  // For sites that refuse to be fetched at all (bot-protected, not just
  // JS-rendered) and aren't worth hand-transcribing — just open the editor
  // with the link(s) pre-filled and let the title/ingredients/etc. be
  // filled in (or left blank) manually.
  const handleSkipToManual = () => {
    const url = fetchUrl.trim();
    setFetchError(null);
    setFetchNotice(null);
    if (isInstagramUrl(url)) {
      setSourceType('instagram');
    } else if (extractYouTubeVideoId(url)) {
      setSourceType('website');
    } else if (url) {
      setSourceType('website');
    }
    setSourceRef(url);
    setDraft({
      title: '',
      ingredients: [],
      instructions: [],
      rawText: '',
      sourceName: url ? deriveSourceNameFromUrl(url) : null
    });
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
          {/* Most recipe websites' pages carry structured Recipe data that
              gets fetched and parsed automatically. These don't -- said
              upfront rather than only after clicking Fetch and hitting an
              error, since it's not obvious which links will and won't work. */}
          <div className="muted import-manual-note">
            Can't be auto-fetched, paste the text below instead: Instagram, YouTube/Shorts, Serious Eats, Maangchi,
            and some other bot-protected recipe sites (the paste box further down still works for any of these).
          </div>
          {fetchError && <div className="editor-error">{fetchError}</div>}
          {fetchNotice && <div className="editor-notice">{fetchNotice}</div>}
          <div className="editor-actions">
            <Button variant="primary" onClick={handleFetch} disabled={fetching}>
              {fetching ? 'Fetching...' : 'Fetch recipe'}
            </Button>
            <Button variant="secondary" onClick={handleSkipToManual}>
              Skip — just save the link(s)
            </Button>
            {user?.role === 'admin' && (
              <ButtonLink to="/epub" variant="secondary">
                + Add from EPUB
              </ButtonLink>
            )}
          </div>

          <div className="import-divider">— or paste the recipe text directly —</div>

          <label className="field">
            <span>Paste recipe text</span>
            <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={12} />
          </label>
          <div className="editor-actions">
            <Button variant="primary" onClick={handleParse}>
              Parse recipe
            </Button>
            <Button variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
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
