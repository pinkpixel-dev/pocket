import { useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, Sparkles, Tag as TagIcon } from 'lucide-react';
import clsx from 'clsx';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toaster';
import { api, ApiError } from '../../lib/api';
import { pluralize } from '../../lib/format';
import type { CleanupAction, CleanupPlan } from '../../lib/types';

interface CollectionCleanupDialogProps {
  open: boolean;
  onClose: () => void;
  onApplied: () => void;
}

function actionKey(action: CleanupAction, index: number): string {
  return `${index}-${action.kind}-${action.target}`;
}

/**
 * Reviews the whole collection list in one go. Merging keeps each old name as
 * a tag, so folding "AI music" into "AI" does not lose the word music.
 */
export function CollectionCleanupDialog({ open, onClose, onApplied }: CollectionCleanupDialogProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [plan, setPlan] = useState<CleanupPlan | null>(null);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    let active = true;
    setLoading(true);
    setPlan(null);
    setSkipped(new Set());
    setError(null);

    api
      .suggestCollectionCleanup()
      .then((result) => {
        if (active) setPlan(result);
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof ApiError ? err.message : 'The cleanup plan could not be made.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open]);

  const actions = plan?.actions ?? [];
  const chosen = actions.filter((action, index) => !skipped.has(actionKey(action, index)));

  const handleApply = async () => {
    if (chosen.length === 0) {
      toast.info('Nothing is ticked, so nothing changed. Tick an action first.');
      return;
    }

    setApplying(true);

    let merged = 0;
    let converted = 0;

    try {
      // Names are resolved against a list kept current as the plan runs, since
      // one action can create the collection the next one merges into.
      const byName = new Map(
        (await api.listCollections()).collections.map((item) => [item.name.toLowerCase(), item.id]),
      );

      for (const action of chosen) {
        const sourceIds = action.sources.map((source) => source.id);

        if (action.kind === 'convert_to_tags') {
          const result = await api.convertCollectionsToTags(sourceIds);
          converted += result.converted;
          for (const source of action.sources) byName.delete(source.name.toLowerCase());
          continue;
        }

        let targetId = byName.get(action.target.toLowerCase());
        if (targetId === undefined) {
          const created = await api.createCollection({ name: action.target });
          targetId = created.collection.id;
          byName.set(created.collection.name.toLowerCase(), targetId);
        }

        const result = await api.mergeCollections(
          sourceIds.filter((id) => id !== targetId),
          targetId,
          { tagWithSourceNames: true },
        );
        merged += result.deletedCollections;
        for (const source of action.sources) byName.delete(source.name.toLowerCase());
      }

      const after = (await api.listCollections()).collections.length;
      const parts = [
        merged > 0 ? `merged ${pluralize(merged, 'collection')}` : '',
        converted > 0 ? `turned ${pluralize(converted, 'collection')} into tags` : '',
      ].filter(Boolean);
      toast.success(
        parts.length > 0
          ? `Tidied up: ${parts.join(', ')}. ${after} left.`
          : `Applied, but nothing changed. Still ${after} collections.`,
      );
      onApplied();
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'The cleanup could not be applied.');
      // Part of the plan may already be applied, so the caller reloads either way.
      onApplied();
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Tidy up collections"
      description="The AI reads your whole collection list and proposes merges. Nothing is deleted, and bookmarks keep their old collection name as a tag."
      footer={
        <>
          <Button onClick={onClose} disabled={applying}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleApply()}
            loading={applying}
            disabled={loading || actions.length === 0}
          >
            Apply {chosen.length > 0 ? `(${chosen.length})` : ''}
          </Button>
        </>
      }
    >
      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Sparkles className="h-8 w-8 animate-pulse text-accent" aria-hidden />
          <p className="mt-3 text-[0.9375rem] font-medium text-ink" aria-live="polite">
            Reading your collections
          </p>
          <p className="mt-1 text-[0.8125rem] text-ink-muted">
            Looking for shelves that are really the same subject.
          </p>
        </div>
      ) : error ? (
        <div className="flex items-start gap-2 rounded-xl border border-danger/40 bg-danger-soft px-3 py-2.5 text-[0.8125rem] text-danger">
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <p>{error}</p>
        </div>
      ) : actions.length === 0 ? (
        <p className="py-8 text-center text-ink-muted">
          Nothing worth merging. Your {plan?.collectionCount ?? 0} collections look fine as they are.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[0.875rem] text-ink-muted">
            {plan?.collectionCount} collections today
            {plan && plan.singletonCount > 0
              ? `, ${plan.singletonCount} holding a single bookmark`
              : ''}
            . Untick anything you want to keep.
          </p>

          <ul className="flex flex-col gap-2">
            {actions.map((action, index) => {
              const key = actionKey(action, index);
              const included = !skipped.has(key);
              const moving = action.sources.reduce((total, item) => total + item.bookmarkCount, 0);

              return (
                <li
                  key={key}
                  className={clsx(
                    'flex gap-3 rounded-xl border p-3 transition-colors',
                    included ? 'border-line-strong bg-raised' : 'border-line bg-surface opacity-60',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={included}
                    onChange={() =>
                      setSkipped((current) => {
                        const next = new Set(current);
                        if (next.has(key)) next.delete(key);
                        else next.add(key);
                        return next;
                      })
                    }
                    aria-label={
                      action.kind === 'merge'
                        ? `Merge into ${action.target}`
                        : `Turn ${action.sources.map((item) => item.name).join(', ')} into tags`
                    }
                    className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-[0.875rem] text-ink">
                      {action.sources.map((source) => (
                        <span
                          key={source.id}
                          className="rounded-md bg-surface px-1.5 py-0.5 text-[0.8125rem] text-ink-muted"
                        >
                          {source.name}
                          <span className="pl-1 text-[0.6875rem] text-ink-faint">
                            {source.bookmarkCount}
                          </span>
                        </span>
                      ))}

                      {action.kind === 'merge' ? (
                        <>
                          <ArrowRight size={14} className="text-ink-faint" aria-hidden />
                          <span className="font-semibold text-ink">{action.target}</span>
                          {action.targetId === null ? (
                            <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[0.6875rem] font-medium text-accent">
                              new
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <ArrowRight size={14} className="text-ink-faint" aria-hidden />
                          <span className="flex items-center gap-1 font-semibold text-ink">
                            <TagIcon size={13} aria-hidden />
                            tags only
                          </span>
                        </>
                      )}
                    </div>

                    <p className="pt-1 text-[0.8125rem] text-ink-muted">
                      {action.reason ||
                        (action.kind === 'merge'
                          ? 'Same subject at different zoom levels.'
                          : 'Too small to be a collection of its own.')}
                    </p>
                    <p className="pt-0.5 text-[0.75rem] text-ink-faint">
                      {pluralize(moving, 'bookmark')} affected, each keeping its old collection name
                      as a tag.
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Dialog>
  );
}
