import { ChangeEvent, FormEvent, useRef, useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase';
import { deleteMyAvatar, updateMyDisplayName, uploadMyAvatar } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { HOW_TO_SECTIONS } from '../content/howTo';

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
          <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploadingAvatar}>
            {uploadingAvatar ? 'Uploading...' : user.avatarUrl ? 'Change picture' : 'Add picture'}
          </Button>
          {user.avatarUrl && (
            <Button variant="secondary" size="sm" onClick={handleRemoveAvatar} disabled={uploadingAvatar}>
              Remove
            </Button>
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

      <div className="profile-field-row">
        <span className="profile-field-label">Email</span>
        <span>{user.email}</span>
      </div>

      <form onSubmit={handleSaveName} className="profile-field-row">
        <span className="profile-field-label">Name</span>
        <input
          className="profile-name-input"
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          placeholder={user.email.split('@')[0]}
        />
        <Button type="submit" variant="primary" size="sm" disabled={savingName}>
          {savingName ? 'Saving...' : 'Save'}
        </Button>
      </form>

      <h2 className="field-section-heading">Password</h2>
      <div className="editor-actions">
        <Button variant="secondary" onClick={handleResetPassword} disabled={resettingPassword}>
          {resettingPassword ? 'Sending...' : 'Send password reset email'}
        </Button>
      </div>

      {error && <div className="editor-error">{error}</div>}
      {notice && <div className="editor-notice">{notice}</div>}

      <h2 className="field-section-heading" style={{ marginTop: 32 }}>
        How this works
      </h2>
      {HOW_TO_SECTIONS.map((section) => (
        <div key={section.heading} className="howto-section">
          <h3 className="howto-heading">{section.heading}</h3>
          {section.paragraphs?.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          {section.list && (
            <ul className="howto-list">
              {section.list.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
