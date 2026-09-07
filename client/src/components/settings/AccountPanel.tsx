import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { KeyRound, LogOut, Trash2, UserPlus } from 'lucide-react';
import { Button } from '../ui/Button';
import { TextField } from '../ui/Field';
import { ConfirmDialog } from '../ConfirmDialog';
import { useToast } from '../ui/Toaster';
import { api, ApiError } from '../../lib/api';
import { pluralize } from '../../lib/format';
import type { SessionUser } from '../../lib/types';

interface AccountPanelProps {
  user: SessionUser;
  onUserChanged: (user: SessionUser) => void;
  onSignOut: () => void;
}

const message = (error: unknown, fallback: string): string =>
  error instanceof ApiError ? error.message : fallback;

function DisplayNameForm({
  user,
  onUserChanged,
}: {
  user: SessionUser;
  onUserChanged: (user: SessionUser) => void;
}) {
  const toast = useToast();
  const [value, setValue] = useState(user.displayName);
  const [busy, setBusy] = useState(false);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await api.updateProfile(value);
      onUserChanged(result.user);
      toast.success('Name updated.');
    } catch (error) {
      toast.error(message(error, 'That name could not be saved.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1">
        <TextField
          label="Display name"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          maxLength={60}
          hint={`Signed in as ${user.username}. The username itself does not change.`}
          disabled={busy}
        />
      </div>
      <Button type="submit" loading={busy} disabled={value.trim() === user.displayName}>
        Save
      </Button>
    </form>
  );
}

function PasswordForm() {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (next !== confirm) {
      setError('Those two passwords do not match.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await api.changePassword({ currentPassword: current, newPassword: next });
      setCurrent('');
      setNext('');
      setConfirm('');
      toast.success(
        result.signedOutElsewhere > 0
          ? `Password changed. ${pluralize(result.signedOutElsewhere, 'other device')} signed out.`
          : 'Password changed.',
      );
    } catch (caught) {
      setError(message(caught, 'That password could not be changed.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-4 border-t border-line pt-5">
      <div>
        <h3 className="text-[0.875rem] font-semibold text-ink">Change your password</h3>
        <p className="mt-1 text-[0.8125rem] text-ink-faint">
          Every other device signed in as you gets signed out, which is the point of doing this.
        </p>
      </div>

      <TextField
        label="Current password"
        type="password"
        value={current}
        onChange={(event) => setCurrent(event.target.value)}
        autoComplete="current-password"
        required
        disabled={busy}
      />
      <TextField
        label="New password"
        type="password"
        value={next}
        onChange={(event) => setNext(event.target.value)}
        autoComplete="new-password"
        required
        disabled={busy}
        hint="At least eight characters."
      />
      <TextField
        label="New password again"
        type="password"
        value={confirm}
        onChange={(event) => setConfirm(event.target.value)}
        autoComplete="new-password"
        required
        disabled={busy}
        error={error}
      />

      <div>
        <Button type="submit" loading={busy}>
          <KeyRound size={14} aria-hidden />
          Change password
        </Button>
      </div>
    </form>
  );
}

/** Only rendered for the owner. Everyone else never sees these controls. */
function PeoplePanel({ currentUser }: { currentUser: SessionUser }) {
  const toast = useToast();
  const [users, setUsers] = useState<SessionUser[] | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<SessionUser | null>(null);
  const [removing, setRemoving] = useState(false);
  const [resetting, setResetting] = useState<SessionUser | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetBusy, setResetBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await api.listUsers();
      setUsers(result.users);
    } catch (caught) {
      toast.error(message(caught, 'The account list could not be loaded.'));
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await api.createUser({ username, password });
      setUsername('');
      setPassword('');
      toast.success(`${username} can sign in now.`);
      await load();
    } catch (caught) {
      setError(message(caught, 'That account could not be created.'));
    } finally {
      setCreating(false);
    }
  };

  const remove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      await api.deleteUser(removeTarget.id);
      toast.success(`${removeTarget.username} was removed.`);
      setRemoveTarget(null);
      await load();
    } catch (caught) {
      toast.error(message(caught, 'That account could not be removed.'));
    } finally {
      setRemoving(false);
    }
  };

  const applyReset = async (event: FormEvent) => {
    event.preventDefault();
    if (!resetting) return;
    setResetBusy(true);
    try {
      await api.resetUserPassword(resetting.id, resetPassword);
      toast.success(`${resetting.username} has a new password. Tell them what it is.`);
      setResetting(null);
      setResetPassword('');
    } catch (caught) {
      toast.error(message(caught, 'That password could not be set.'));
    } finally {
      setResetBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 border-t border-line pt-5">
      <div>
        <h3 className="text-[0.875rem] font-semibold text-ink">People on this Pocket</h3>
        <p className="mt-1 text-[0.8125rem] text-ink-faint">
          Everyone gets their own bookmarks, collections, tags and AI settings. Nobody can see anyone
          else's library, including you.
        </p>
      </div>

      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
        {(users ?? []).map((person) => (
          <li key={person.id} className="flex flex-wrap items-center gap-3 bg-surface px-3.5 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.875rem] text-ink">
                {person.displayName}
                {person.isOwner ? (
                  <span className="ml-2 rounded-full border border-line px-1.5 py-0.5 text-[0.6875rem] text-ink-faint">
                    owner
                  </span>
                ) : null}
                {person.id === currentUser.id ? (
                  <span className="ml-2 text-[0.75rem] text-ink-faint">you</span>
                ) : null}
              </p>
              <p className="truncate text-[0.75rem] text-ink-faint">
                {person.username} · {pluralize(person.bookmarkCount, 'bookmark')}
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setResetting(person);
                  setResetPassword('');
                }}
              >
                <KeyRound size={14} aria-hidden />
                Reset password
              </Button>
              {person.isOwner || person.id === currentUser.id ? null : (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove ${person.username}`}
                  onClick={() => setRemoveTarget(person)}
                >
                  <Trash2 size={14} aria-hidden />
                </Button>
              )}
            </div>
          </li>
        ))}
        {users !== null && users.length === 0 ? (
          <li className="bg-surface px-3.5 py-3 text-[0.8125rem] text-ink-faint">No accounts yet.</li>
        ) : null}
      </ul>

      <form onSubmit={create} className="flex flex-col gap-3 rounded-xl border border-line bg-canvas p-3.5">
        <p className="text-[0.875rem] font-medium text-ink">Add someone</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <TextField
              label="Username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              disabled={creating}
            />
          </div>
          <div className="flex-1">
            <TextField
              label="Starting password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              required
              disabled={creating}
              error={error}
            />
          </div>
        </div>
        <p className="text-[0.8125rem] text-ink-faint">
          Give them the password in person, then have them change it from this screen.
        </p>
        <div>
          <Button type="submit" loading={creating}>
            <UserPlus size={14} aria-hidden />
            Create account
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={removeTarget !== null}
        title={`Remove ${removeTarget?.username ?? ''}?`}
        message={`This deletes their account and all ${removeTarget?.bookmarkCount ?? 0} of their bookmarks, along with their collections and tags. It cannot be undone.`}
        confirmLabel="Remove the account"
        busy={removing}
        onConfirm={() => void remove()}
        onClose={() => setRemoveTarget(null)}
      />

      {resetting ? (
        <form
          onSubmit={applyReset}
          className="flex flex-col gap-3 rounded-xl border border-accent/40 bg-canvas p-3.5"
        >
          <p className="text-[0.875rem] font-medium text-ink">
            New password for {resetting.username}
          </p>
          <TextField
            label="New password"
            type="password"
            value={resetPassword}
            onChange={(event) => setResetPassword(event.target.value)}
            autoComplete="new-password"
            required
            disabled={resetBusy}
            hint="Their other devices get signed out."
          />
          <div className="flex gap-2">
            <Button type="submit" variant="primary" loading={resetBusy}>
              Set it
            </Button>
            <Button type="button" onClick={() => setResetting(null)} disabled={resetBusy}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

export function AccountPanel({ user, onUserChanged, onSignOut }: AccountPanelProps) {
  return (
    <div className="flex flex-col gap-5">
      <DisplayNameForm user={user} onUserChanged={onUserChanged} />
      <PasswordForm />
      {user.isOwner ? <PeoplePanel currentUser={user} /> : null}

      <div className="border-t border-line pt-5">
        <Button variant="secondary" onClick={onSignOut}>
          <LogOut size={14} aria-hidden />
          Sign out
        </Button>
      </div>
    </div>
  );
}
