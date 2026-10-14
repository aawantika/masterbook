import { useRef, useState } from 'react';
import { addSourcePhoto, createRecipe, uploadImage } from '../api/client';
import { Button } from './Button';

type QuickPhotoUploadProps = {
  onCreated: (recipeId: number) => void;
  onCancel: () => void;
};

function defaultTitle(): string {
  return `Recipe scan — ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

// Experimental, deliberately minimal: no ingredients/instructions form at
// all, just "attach some photos and save" -- for transcribing a handwritten
// recipe later rather than typing it in on the spot. Creates a stub recipe
// (empty ingredients/instructions, no dish photo) and attaches every
// selected photo as a source photo. The stub naturally lands in the
// existing "Needs Fixing" queue -- createRecipe auto-flags any recipe
// saved with no image_url, which this always has (the uploaded photos are
// source photos, not the dish photo).
export function QuickPhotoUpload({ onCreated, onCancel }: QuickPhotoUploadProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (selected: FileList | null) => {
    if (!selected || selected.length === 0) return;
    setFiles((prev) => [...prev, ...Array.from(selected)]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (files.length === 0) return;
    setError(null);
    setSaving(true);
    try {
      const recipe = await createRecipe({
        title: title.trim() || defaultTitle(),
        servings: null,
        totalTimeMinutes: null,
        instructions: [],
        ingredients: [],
        rawText: '',
        sourceType: 'manual',
        sourceRef: null,
        sourceName: null,
        videoRef: null,
        imageUrl: null,
        notes: null,
        mealTypeIds: [],
        cuisineNames: []
      });
      // Sequential, not Promise.all -- uploadImage + addSourcePhoto each
      // hit the server; a handful of small sequential requests is simple
      // and plenty fast here, no need for the added complexity of
      // concurrent upload handling for what's usually 1-3 photos.
      for (const file of files) {
        const { imageUrl } = await uploadImage(file);
        await addSourcePhoto(recipe.id, imageUrl);
      }
      onCreated(recipe.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="quick-photo-upload">
      <p className="muted">
        Take or choose photos of a handwritten recipe — no typing required. It'll show up under{' '}
        <strong>Needs Fixing</strong> so you (or whoever's turn it is) can transcribe it into a real recipe later.
      </p>

      <label className="field">
        <span>Title (optional)</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={defaultTitle()} />
      </label>

      <div className="quick-photo-grid">
        {files.map((file, i) => (
          <div className="quick-photo-thumb" key={`${file.name}-${i}`}>
            <img src={URL.createObjectURL(file)} alt="" />
            <button type="button" className="quick-photo-remove" onClick={() => removeFile(i)} aria-label="Remove photo">
              ×
            </button>
          </div>
        ))}
        <button type="button" className="quick-photo-add" onClick={() => fileInputRef.current?.click()}>
          + Add photo
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        capture="environment"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {error && <div className="editor-error">{error}</div>}

      <div className="editor-actions">
        <Button variant="primary" onClick={handleSave} disabled={saving || files.length === 0}>
          {saving ? 'Saving...' : files.length > 0 ? `Save (${files.length} photo${files.length === 1 ? '' : 's'})` : 'Save'}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
