import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { createSession, deleteSession, getMe } from '../api/client';
import { User } from '../api/types';

export type AuthState = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  // Re-fetches /me and updates context state -- called after a
  // self-service profile change (display name, avatar) so the topbar and
  // everywhere else reading useAuth().user reflect it immediately, instead
  // of only updating the profile page's own local state.
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fires on sign-in, sign-out, and silent token refresh. Firebase only
    // knows "who" -- our own server is the source of truth for "what
    // role," so a sign-in fetches the local profile via /api/auth/me
    // before loading is considered done.
    return onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setLoading(false);
        return;
      }
      try {
        const me = await getMe();
        // Only approved accounts get the image cookie (the server refuses
        // pending ones) -- asking for it otherwise would just be a 403 that
        // hides the pending-approval screen behind a "failed" login.
        if (me.approvedAt) await createSession();
        setUser(me);
      } catch {
        // Authenticated with Firebase but rejected by our server (not yet
        // added by the admin -- see requireAuth's 403 case in
        // server/src/middleware/auth.ts). Treat as logged out from the
        // app's perspective even though Firebase itself still thinks
        // they're signed in.
        setUser(null);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged above picks up the resulting sign-in and fetches
    // the profile -- nothing else to do here.
  };

  const logout = async () => {
    // Before signOut -- the DELETE itself needs the still-valid Bearer token.
    await deleteSession().catch(() => {});
    await signOut(auth);
  };

  const refreshUser = async () => {
    const me = await getMe();
    setUser(me);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
