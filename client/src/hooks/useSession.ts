import { useCallback, useEffect, useState } from 'react';
import { api, setUnauthorizedHandler } from '../lib/api';
import type { SessionUser } from '../lib/types';

export type SessionStatus = 'loading' | 'setup' | 'signed-out' | 'signed-in' | 'unreachable';

export interface Session {
  status: SessionStatus;
  user: SessionUser | null;
  /** Set when Pocket itself could not be reached, so the screen can say so. */
  error: string | null;
  refresh: () => Promise<void>;
  /** Called by the sign-in and setup forms once the server has answered. */
  adopt: (user: SessionUser) => void;
  signOut: () => Promise<void>;
}

export function useSession(): Session {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const state = await api.session();
      setError(null);
      setUser(state.user);
      setStatus(state.user ? 'signed-in' : state.needsSetup ? 'setup' : 'signed-out');
    } catch (caught) {
      setUser(null);
      setStatus('unreachable');
      setError(caught instanceof Error ? caught.message : 'Pocket could not be reached.');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /*
   * A session can expire while a tab sits open overnight. Without this the next
   * request would surface as a toast on a page the user can no longer use, so
   * any 401 outside the auth routes drops straight back to the sign-in screen.
   */
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setStatus('signed-out');
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const adopt = useCallback((next: SessionUser) => {
    setUser(next);
    setError(null);
    setStatus('signed-in');
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // The cookie is gone either way; the screen should not get stuck.
    }
    setUser(null);
    setStatus('signed-out');
  }, []);

  return { status, user, error, refresh, adopt, signOut };
}
