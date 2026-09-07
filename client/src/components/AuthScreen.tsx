import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from './ui/Button';
import { TextField } from './ui/Field';
import { api, ApiError } from '../lib/api';
import type { SessionUser } from '../lib/types';

interface AuthScreenProps {
  /** 'setup' claims the owner account on a fresh install. */
  mode: 'setup' | 'signin';
  onSignedIn: (user: SessionUser) => void;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-5 py-10">
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}

export function AuthScreen({ mode, onSignedIn }: AuthScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const setup = mode === 'setup';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;

    if (setup && password !== confirm) {
      setError('Those two passwords do not match.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = setup
        ? await api.setup({ username, password })
        : await api.login({ username, password });
      onSignedIn(result.user);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Pocket could not reach the server.',
      );
      setBusy(false);
    }
  };

  return (
    <Shell>
      <div className="mb-7 text-center">
        <h1 className="text-2xl font-semibold text-ink">Pocket</h1>
        <p className="mt-2 text-[0.875rem] text-ink-muted">
          {setup
            ? 'Pick a username and password. This first account owns the library that is already here, and is the only one that can add other people.'
            : 'Sign in to open your library.'}
        </p>
      </div>

      <form
        onSubmit={submit}
        className="flex flex-col gap-4 rounded-(--radius-card) border border-line bg-surface p-5"
      >
        <TextField
          label="Username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          // A fresh install has one job on this screen, so it takes the cursor.
          autoFocus
          disabled={busy}
        />

        <TextField
          label="Password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete={setup ? 'new-password' : 'current-password'}
          required
          disabled={busy}
          hint={setup ? 'At least eight characters. A phrase you can remember beats a short scramble.' : undefined}
        />

        {setup ? (
          <TextField
            label="Password again"
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
            required
            disabled={busy}
          />
        ) : null}

        {error ? (
          <p role="alert" className="text-[0.8125rem] text-danger">
            {error}
          </p>
        ) : null}

        <Button type="submit" variant="primary" loading={busy} className="mt-1">
          {setup ? 'Create the owner account' : 'Sign in'}
        </Button>
      </form>

      {setup ? null : (
        <p className="mt-4 text-center text-[0.8125rem] text-ink-faint">
          Accounts are made by whoever owns this Pocket. Ask them if you do not have one.
        </p>
      )}
    </Shell>
  );
}

/** Shown while the first session check is in flight, and if it fails outright. */
export function AuthLoading({ error, onRetry }: { error?: string | null; onRetry?: () => void }) {
  return (
    <Shell>
      {error ? (
        <div className="rounded-(--radius-card) border border-line bg-surface p-5 text-center">
          <p className="text-[0.875rem] text-ink">Pocket could not be reached.</p>
          <p className="mt-2 text-[0.8125rem] text-ink-muted">{error}</p>
          {onRetry ? (
            <Button variant="secondary" onClick={onRetry} className="mt-4">
              Try again
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2 text-ink-muted">
          <Loader2 size={18} className="animate-spin" aria-hidden />
          <span className="text-[0.875rem]">Opening Pocket…</span>
        </div>
      )}
    </Shell>
  );
}
