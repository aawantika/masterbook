import { useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { deleteEpubSource, listEpubSources, uploadEpub } from '../api/client';
import { EpubSource } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ConfirmDialog } from '../components/ConfirmDialog';

export function EpubLibraryPage() {
  const { user } = useAuth();
  const [sources, setSources] = useState<EpubSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<EpubSource | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reload = () => {
    setLoading(true);
    listEpubSources()
      .then(setSources)
      .finally(() => setLoading(false));
  };

  useEffect(reload, []);

  // Same ConfirmDialog as recipe delete, not window.confirm -- the native
  // browser dialog can't be styled and reads as jarring/out of place next
  // to everything else in the app.
  const confirmDelete = async () => {
    if (!confirmingDelete) return;
    const source = confirmingDelete;
    setConfirmingDelete(null);
    await deleteEpubSource(source.id);
    reload();
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.epub')) {
      setUploadError('That doesn\'t look like an EPUB file (expected a .epub extension).');
      return;
    }
    setUploadError(null);
    setUploading(true);
    try {
      await uploadEpub(file);
      reload();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to upload that file.');
    } finally {
      setUploading(false);
    }
  };

  // Real enforcement is server-side (requireAdmin on /api/epub) -- this is
  // just UX so a non-admin who hits /epub directly sees a redirect instead
  // of a page full of failed-request errors.
  if (user && user.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="detail-panel">
      <h1>EPUB library</h1>

      <div
        className={`epub-dropzone${dragOver ? ' epub-dropzone-active' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFile(e.dataTransfer.files[0]);
        }}
        onClick={() => fileInputRef.current?.click()}
      >
        {uploading ? (
          <span>Uploading...</span>
        ) : (
          <span>Drag an EPUB here, or click to choose a file</span>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".epub,application/epub+zip"
          hidden
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>
      {uploadError && <div className="editor-error">{uploadError}</div>}

      {loading ? (
        <div className="muted">Loading...</div>
      ) : sources.length === 0 ? (
        <div className="muted">No books uploaded yet.</div>
      ) : (
        <ul className="epub-source-list">
          {sources.map((source) => (
            <li key={source.id} className="epub-source-row">
              <Link to={`/epub/${source.id}`} className="epub-source-card">
                <div className="epub-source-title">{source.title || source.filename || 'Untitled book'}</div>
                {source.author && <div className="epub-source-author">{source.author}</div>}
                <div className="muted epub-source-meta">
                  {source.recipeCount} recipe{source.recipeCount === 1 ? '' : 's'} saved
                </div>
              </Link>
              <button
                type="button"
                className="link-button danger epub-source-delete"
                onClick={() => setConfirmingDelete(source)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      {confirmingDelete && (
        <ConfirmDialog
          title="Delete this book?"
          message={
            confirmingDelete.recipeCount > 0
              ? `"${confirmingDelete.title || confirmingDelete.filename || 'This book'}" will be deleted. Its ${confirmingDelete.recipeCount} saved recipe${confirmingDelete.recipeCount === 1 ? '' : 's'} will stay in your cookbook, but any unextracted bookmarks will be lost. This can't be undone.`
              : `"${confirmingDelete.title || confirmingDelete.filename || 'This book'}" will be permanently deleted. This can't be undone.`
          }
          confirmLabel="Delete"
          onConfirm={confirmDelete}
          onCancel={() => setConfirmingDelete(null)}
        />
      )}
    </div>
  );
}
