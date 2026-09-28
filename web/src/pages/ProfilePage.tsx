import { ChangeEvent, FormEvent, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase';
import { deleteMyAvatar, updateMyDisplayName, uploadMyAvatar } from '../api/client';
import { useAuth } from '../auth/AuthContext';

export function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [nameDraft, setNameDraft] = useState(user?.displayName ?? '');
  const [savingName, setSavingName] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!user) return null;

  const handleSaveName = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setSavingName(true);
    try {
      await updateMyDisplayName(nameDraft.trim() || null);
      await refreshUser();
      setNotice('Name updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update name.');
    } finally {
      setSavingName(false);
    }
  };

  const handleAvatarChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // lets picking the same file again re-trigger onChange
    if (!file) return;
    setError(null);
    setNotice(null);
    setUploadingAvatar(true);
    try {
      await uploadMyAvatar(file);
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload profile picture.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setError(null);
    setNotice(null);
    setUploadingAvatar(true);
    try {
      await deleteMyAvatar();
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove profile picture.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleResetPassword = async () => {
    setError(null);
    setNotice(null);
    setResettingPassword(true);
    try {
      await sendPasswordResetEmail(auth, user.email);
      setNotice(`Password reset email sent to ${user.email} — check your inbox (and spam folder).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email.');
    } finally {
      setResettingPassword(false);
    }
  };

  return (
    <div className="detail-panel">
      <h1>Your profile</h1>

      <div className="profile-avatar-row">
        {user.avatarUrl ? (
          <img className="profile-avatar" src={user.avatarUrl} alt="" />
        ) : (
          <div className="profile-avatar profile-avatar-placeholder">
            {(user.displayName || user.email).slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="profile-avatar-actions">
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadingAvatar}>
            {uploadingAvatar ? 'Uploading...' : user.avatarUrl ? 'Change picture' : 'Add picture'}
          </button>
          {user.avatarUrl && (
            <button type="button" className="secondary" onClick={handleRemoveAvatar} disabled={uploadingAvatar}>
              Remove
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            style={{ display: 'none' }}
            onChange={handleAvatarChange}
          />
        </div>
      </div>

      <div className="field">
        <span>Email</span>
        <div>{user.email}</div>
      </div>

      <form onSubmit={handleSaveName} className="field-row">
        <label className="field" style={{ flex: 1 }}>
          <span>Name</span>
          <input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            placeholder={user.email.split('@')[0]}
          />
        </label>
        <button type="submit" className="primary-button" disabled={savingName}>
          {savingName ? 'Saving...' : 'Save name'}
        </button>
      </form>

      <h2 className="field-section-heading">Password</h2>
      <div className="editor-actions">
        <button type="button" onClick={handleResetPassword} disabled={resettingPassword}>
          {resettingPassword ? 'Sending...' : 'Send password reset email'}
        </button>
      </div>

      {error && <div className="editor-error">{error}</div>}
      {notice && <div className="editor-notice">{notice}</div>}

      <div className="profile-howto-link">
        <Link to="/how-to">How does this app work? →</Link>
      </div>
    </div>
  );
}
