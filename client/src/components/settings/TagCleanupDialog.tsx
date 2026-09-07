import { useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, Sparkles, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toaster';
import { api, ApiError } from '../../lib/api';
import { pluralize } from '../../lib/format';
import type { TagCleanupAction, TagCleanupPlan } from '../../lib/types';

interface TagCleanupDialogProps {
  open: boolean;
  onClose: () => void;
  onApplied: () => void;
}

function actionKey(action: TagCleanupAction, index: number): string {
  return `${index}-${action.kind}-${action.target}`;
}

/**
 * Tags fragment into synonyms and plurals rather than sub-topics, so this
 * mostly folds words that mean the same thing. Deletions are proposed only for
 * tags that group nothing, and they start unticked because they lose a label
 * rather than moving it.
 */
export function TagCleanupDialog({ open, onClose, onApplied }: TagCleanupDialogProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [plan, setPlan] = useState<TagCleanupPlan | null>(null);
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
      .suggestTagCleanup()
      .then((result) => {
        if (!active) return;
        setPlan(result);
        // Merges are reversible enough to accept in bulk. Deleting a tag is not,
        // so those wait for a deliberate tick.
        setSkipped(
          new Set(
            result.actions
              .map((action, index) => (action.kind === 'delete' ? actionKey(action, index) : ''))
              .filter(Boolean),
          ),
        );
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof ApiError ? err.message : 'The tag plan could not be made.');
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
  const deleting = chosen.filter((action) => action.kind === 'delete').length;

  const handleApply = async () => {
    if (chosen.length === 0) return;
    setApplying(true);

    let merged = 0;
    let removed = 0;

    try {
      for (const action of chosen) {
        const ids = action.sources.map((source) => source.id);
        if (action.kind === 'delete') {
          removed += (await api.bulkDeleteTags(ids)).deleted;
        } else {
          merged += (await api.mergeTags(ids, action.target)).merged;
        }
      }

      const parts = [
        merged > 0 ? `merged ${pluralize(merged, 'tag')}` : '',
        removed > 0 ? `removed ${pluralize(removed, 'tag')}` : '',
      ].filter(Boolean);
      toast.success(`Tidied up: ${parts.join(', ')}.`);
      onApplied();
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'The cleanup could not be applied.');
      // Part of the plan may already have run, so the list is reloaded either way.
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
      title="Tidy up tags"
      description="The AI reads your whole tag list and folds synonyms, plurals and rephrasings together. Bookmarks keep the merged tag."
      footer={
        <>
          <Button onClick={onClose} disabled={applying}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleApply()}
            loading={applying}
            disabled={loading || chosen.length === 0}
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
            Reading your tags
          </p>
          <p className="mt-1 text-[0.8125rem] text-ink-muted">
            Looking for words that mean the same thing.
          </p>
        </div>
      ) : error ? (
        <div className="flex items-start gap-2 rounded-xl border border-danger/40 bg-danger-soft px-3 py-2.5 text-[0.8125rem] text-danger">
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <p>{error}</p>
        </div>
      ) : actions.length === 0 ? (
        <p className="py-8 text-center text-ink-muted">
          Nothing worth merging. Your {plan?.tagCount ?? 0} tags look fine as they are.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[0.875rem] text-ink-muted">
            {plan?.tagCount} tags today
            {plan && plan.singletonCount > 0
              ? `, ${plan.singletonCount} used on a single bookmark`
              : ''}
            . Merges are ticked. Deletions are not, since they lose the label instead of moving it.
          </p>

          <ul className="flex flex-col gap-2">
            {actions.map((action, index) => {
              const key = actionKey(action, index);
              const included = !skipped.has(key);
              const affected = action.sources.reduce((total, item) => total + item.bookmarkCount, 0);

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
                        : `Remove ${action.sources.map((item) => item.name).join(', ')}`
                    }
                    className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-[0.875rem]">
                      {action.sources.map((source) => (
                        <span
                          key={source.id}
                          className="rounded-md bg-surface px-1.5 py-0.5 font-mono text-[0.8125rem] text-ink-muted"
                        >
                          {source.name}
                          <span className="pl-1 text-[0.6875rem] text-ink-faint">
                            {source.bookmarkCount}
                          </span>
                        </span>
                      ))}

                      <ArrowRight size={14} className="text-ink-faint" aria-hidden />

                      {action.kind === 'merge' ? (
                        <span className="font-mono text-[0.875rem] font-semibold text-ink">
                          {action.target}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[0.8125rem] font-semibold text-danger">
                          <Trash2 size={13} aria-hidden />
                          removed
                        </span>
                      )}
                    </div>

                    <p className="pt-1 text-[0.8125rem] text-ink-muted">
                      {action.reason ||
                        (action.kind === 'merge'
                          ? 'These say the same thing.'
                          : 'Groups nothing and never will.')}
                    </p>
                    <p className="pt-0.5 text-[0.75rem] text-ink-faint">
                      {pluralize(affected, 'bookmark')} affected.
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>

          {deleting > 0 ? (
            <p className="text-[0.8125rem] text-danger">
              {pluralize(deleting, 'deletion')} ticked. Those tags are gone for good.
            </p>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}
