import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Activity, Loader2, TriangleAlert } from 'lucide-react';
import { TransferPanel } from './settings/TransferPanel';
import { OrganizePanel } from './settings/OrganizePanel';
import { AiPanel } from './settings/AiPanel';
import { AccountPanel } from './settings/AccountPanel';
import { Button } from './ui/Button';
import { SelectField } from './ui/Field';
import { useToast } from './ui/Toaster';
import { pluralize, relativeTime } from '../lib/format';
import { ACCENT_COLORS } from '../lib/theme';
import { api } from '../lib/api';
import type {
  AccentColor,
  AiSettings,
  AuditStatus,
  CardSize,
  Collection,
  SessionUser,
  Stats,
  Tag,
} from '../lib/types';

interface SettingsViewProps {
  user: SessionUser;
  onUserChanged: (user: SessionUser) => void;
  onSignOut: () => void;
  stats: Stats | null;
  collections: Collection[];
  tags: Tag[];
  cardSize: CardSize;
  accentColor: AccentColor;
  aiSettings: AiSettings | null;
  onCardSizeChange: (value: CardSize) => void;
  onAccentColorChange: (value: AccentColor) => void;
  onAiSettingsChange: (settings: AiSettings) => void;
  onChanged: () => void;
  onEditCollection: (collection: Collection) => void;
}

const CARD_SIZES: Array<{ value: CardSize; label: string }> = [
  { value: 'small', label: 'Small (most links on screen)' },
  { value: 'medium', label: 'Medium (the default)' },
  { value: 'large', label: 'Large (big previews)' },
];

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-(--radius-card) border border-line bg-surface p-5">
      <h2 className="mb-4 text-base text-ink">{title}</h2>
      {children}
    </section>
  );
}

interface LinkHealthSectionProps {
  stats: Stats | null;
  onChanged: () => void;
  /**
   * Bumped when an import leaves a check running, so the progress bar picks it
   * up instead of waiting for the next visit to Settings.
   */
  watch: number;
}

function LinkHealthSection({ stats, onChanged, watch }: LinkHealthSectionProps) {
  const toast = useToast();
  const [audit, setAudit] = useState<AuditStatus | null>(null);
  const pollTimer = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimer.current !== null) {
      window.clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const pollStatus = useCallback(async () => {
    try {
      const status = await api.getAuditStatus();
      setAudit(status);
      if (!status.running) {
        stopPolling();
        onChanged();
      }
    } catch {
      stopPolling();
    }
  }, [stopPolling, onChanged]);

  useEffect(() => {
    void api.getAuditStatus().then((initial) => {
      setAudit(initial);
      if (initial.running) {
        stopPolling();
        pollTimer.current = window.setInterval(() => void pollStatus(), 1000);
      }
    });
    return stopPolling;
  }, [pollStatus, stopPolling, watch]);

  const handleStart = async () => {
    try {
      const initial = await api.startAudit();
      setAudit(initial);
      stopPolling();
      pollTimer.current = window.setInterval(() => void pollStatus(), 1000);
      toast.info('Scanning saved bookmarks for broken links...');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not start scan.');
    }
  };

  const handleCancel = async () => {
    try {
      await api.cancelAudit();
      stopPolling();
      const status = await api.getAuditStatus();
      setAudit(status);
      toast.info('Scan stopped.');
      onChanged();
    } catch {
      // Ignored
    }
  };

  if (audit?.running) {
    const pct = audit.total > 0 ? Math.round((audit.checked / audit.total) * 100) : 0;
    return (
      <div className="mt-4 flex flex-col gap-2.5 rounded-xl border border-line bg-canvas p-3.5">
        <div className="flex items-center justify-between text-[0.875rem]">
          <span className="flex items-center gap-2 font-medium text-ink">
            <Loader2 size={16} className="animate-spin text-accent" aria-hidden />
            Checking bookmarks...
          </span>
          <span className="font-mono text-xs text-ink-muted tabular-nums">
            {audit.checked} / {audit.total} ({pct}%)
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
          <div
            className="h-full bg-accent transition-all duration-200"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className={audit.broken > 0 ? 'font-medium text-danger' : 'text-ink-faint'}>
            {audit.broken > 0 ? `${pluralize(audit.broken, 'broken link')} found` : 'No dead links found so far'}
          </span>
          <button
            type="button"
            onClick={handleCancel}
            className="text-ink-muted transition-colors hover:text-ink"
          >
            Cancel scan
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-[0.875rem] font-semibold text-ink">Link health check</h4>
          <p className="text-[0.8125rem] text-ink-muted">
            {stats && stats.needsAttention > 0
              ? `${pluralize(stats.needsAttention, 'bookmark')} could not be read or failed to respond.`
              : 'Scan all saved links to check for dead pages, 404s, or unreachable domains.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {stats && stats.needsAttention > 0 ? (
            <a
              href="#/attention"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-danger/40 bg-danger/10 px-3 text-[0.8125rem] font-medium text-danger transition-colors hover:bg-danger/20"
            >
              <TriangleAlert size={14} aria-hidden />
              View {stats.needsAttention} broken
            </a>
          ) : null}
          <Button variant="secondary" size="sm" onClick={handleStart}>
            <Activity size={14} aria-hidden />
            Check for dead links
          </Button>
        </div>
      </div>
      {audit?.lastRunAt ? (
        <p className="text-[0.75rem] text-ink-faint">
          Last checked {relativeTime(audit.lastRunAt)}
        </p>
      ) : null}
    </div>
  );
}

export function SettingsView({
  user,
  onUserChanged,
  onSignOut,
  stats,
  collections,
  tags,
  cardSize,
  accentColor,
  aiSettings,
  onCardSizeChange,
  onAccentColorChange,
  onAiSettingsChange,
  onChanged,
  onEditCollection,
}: SettingsViewProps) {
  // Bumped by an import that leaves a link check running, so the progress bar
  // below starts following it straight away.
  const [linkCheckToken, setLinkCheckToken] = useState(0);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-3 py-5 sm:px-6 sm:py-6">
      <Panel title="Your account">
        <AccountPanel user={user} onUserChanged={onUserChanged} onSignOut={onSignOut} />
      </Panel>

      <Panel title="Your library">
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
          {[
            { label: 'Bookmarks', value: stats?.total ?? 0 },
            { label: 'Pinned', value: stats?.pinned ?? 0 },
            { label: 'Collections', value: stats?.collections ?? 0 },
            { label: 'Tags', value: stats?.tags ?? 0 },
          ].map((item) => (
            <div key={item.label} className="bg-surface px-3 py-3">
              <dt className="text-[0.75rem] text-ink-faint">{item.label}</dt>
              <dd className="font-mono text-xl text-ink tabular-nums">{item.value}</dd>
            </div>
          ))}
        </dl>

        <LinkHealthSection stats={stats} onChanged={onChanged} watch={linkCheckToken} />
      </Panel>

      <Panel title="Appearance">
        <SelectField
          label="Card size"
          hint="How big the cards are in grid view. Smaller cards fit more links on screen and drop the description to stay readable."
          value={cardSize}
          onChange={(event) => onCardSizeChange(event.target.value as CardSize)}
        >
          {CARD_SIZES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>

        <div className="mt-6 border-t border-line/60 pt-5">
          <label className="block text-[0.875rem] font-medium text-ink">
            Accent color
          </label>
          <p className="mt-1 text-[0.8125rem] text-ink-faint">
            Personalize buttons, selection highlights, active indicators, and the Pocket logo.
          </p>

          <div
            role="radiogroup"
            aria-label="Accent color"
            className="mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4"
          >
            {ACCENT_COLORS.map((color) => {
              const active = accentColor === color.id;
              return (
                <button
                  key={color.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={color.id === 'gold' ? `${color.name} (default)` : color.name}
                  onClick={() => onAccentColorChange(color.id)}
                  className={clsx(
                    'group flex min-h-12 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-[0.875rem] transition-all',
                    active
                      ? 'border-accent bg-raised font-semibold text-ink shadow-sm'
                      : 'border-line bg-surface text-ink-muted hover:border-line-strong hover:bg-hover hover:text-ink',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full shadow-inner ring-1 ring-black/20"
                    style={{ backgroundColor: color.swatch }}
                  >
                    {active ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-white shadow-xs" />
                    ) : null}
                  </span>
                  <span className="truncate">
                    {color.name}
                    {color.id === 'gold' ? (
                      <span className="ml-1 text-[0.75rem] font-normal text-ink-faint">
                        (default)
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </Panel>

      <Panel title="Filling in links with AI">
        <AiPanel settings={aiSettings} onChanged={onAiSettingsChange} />
      </Panel>

      <Panel title="Backup and transfer">
        <TransferPanel
          onImported={onChanged}
          onLinkCheckStarted={() => setLinkCheckToken((value) => value + 1)}
        />
      </Panel>

      <Panel title="Collections and tags">
        <OrganizePanel
          collections={collections}
          tags={tags}
          aiConfigured={Boolean(aiSettings?.configured)}
          onChanged={onChanged}
          onEditCollection={onEditCollection}
        />
      </Panel>

      <Panel title="About Pocket">
        <div className="flex flex-col gap-3 text-[0.875rem] text-ink-muted">
          <p>
            Pocket runs entirely on your own hardware. Bookmarks live in a SQLite file and cached previews sit
            beside it in your mounted data directory, so a normal file backup captures everything.
          </p>
          <p>
            Everyone who signs in gets their own library. Bookmarks, collections, tags and AI settings are
            private to the account that made them, so sharing a NAS does not mean sharing a bookmark bar.
          </p>
          <p>
            Sign-in is Pocket's own, and it is the only thing standing between the open internet and your
            library. Keep it on a trusted network, or put it behind a reverse proxy with TLS before exposing
            it.
          </p>
          <p className="text-ink-faint">
            Made with care by{' '}
            <a
              href="https://pinkpixel.dev"
              target="_blank"
              rel="noreferrer noopener"
              className="text-accent hover:underline"
            >
              Pink Pixel
            </a>
          </p>
        </div>
      </Panel>
    </div>
  );
}
