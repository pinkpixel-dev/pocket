import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Sparkles, X } from 'lucide-react';
import { Dialog } from './ui/Dialog';
import { Button } from './ui/Button';
import { useToast } from './ui/Toaster';
import { CategorySuggestionRow } from './CategorySuggestionRow';
import { api, ApiError } from '../lib/api';
import { pluralize } from '../lib/format';
import type { CategorySuggestion, CollectionPlan } from '../lib/types';

interface AiCategorizeDialogProps {
  open: boolean;
  onClose: () => void;
  onApplied: () => void;
  bookmarkIds?: number[];
  domainFilter?: string;
}

/** Bookmarks per filing request. Small enough that progress keeps moving. */
const CHUNK = 40;

type Stage = 'planning' | 'plan' | 'filing' | 'review';

/**
 * Two passes. First the AI decides which collections this run may use, then it
 * files every bookmark into that closed list. Filing one at a time is what
 * grew a collection per bookmark in the first place, so the plan comes first
 * and the filing step cannot add to it.
 */
export function AiCategorizeDialog({
  open,
  onClose,
  onApplied,
  bookmarkIds,
  domainFilter,
}: AiCategorizeDialogProps) {
  const toast = useToast();
  const [stage, setStage] = useState<Stage>('planning');
  const [plan, setPlan] = useState<CollectionPlan | null>(null);
  const [dropped, setDropped] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [suggestions, setSuggestions] = useState<CategorySuggestion[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [edited, setEdited] = useState<Map<number, string>>(new Map());
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Closing the dialog mid-run must stop the loop, not just hide it.
  const runId = useRef(0);

  useEffect(() => {
    if (!open) {
      runId.current += 1;
      return;
    }

    const id = ++runId.current;
    setStage('planning');
    setPlan(null);
    setDropped(new Set());
    setSuggestions([]);
    setSelectedIds(new Set());
    setEdited(new Map());
    setProgress({ done: 0, total: 0 });
    setError(null);

    api
      .planCollections({ bookmarkIds: bookmarkIds?.length ? bookmarkIds : undefined })
      .then((result) => {
        if (id !== runId.current) return;
        setPlan(result);
        setStage('plan');
      })
      .catch((err) => {
        if (id !== runId.current) return;
        setError(err instanceof ApiError ? err.message : 'The collection plan could not be made.');
        setStage('plan');
      });
  }, [open, bookmarkIds]);

  const keptNames = (plan?.collections ?? [])
    .filter((item) => !dropped.has(item.name))
    .map((item) => item.name);

  const startFiling = useCallback(async () => {
    if (!plan || keptNames.length === 0) return;

    const id = runId.current;
    const ids = plan.bookmarkIds;
    setStage('filing');
    setError(null);
    setProgress({ done: 0, total: ids.length });

    for (let index = 0; index < ids.length; index += CHUNK) {
      const chunk = ids.slice(index, index + CHUNK);
      try {
        const result = await api.suggestBatchCategories({
          bookmarkIds: chunk,
          limit: chunk.length,
          collections: keptNames,
        });
        if (id !== runId.current) return;

        setSuggestions((current) => [...current, ...result.suggestions]);
        setSelectedIds((current) => {
          const next = new Set(current);
          // Anything the AI could not place is left out of the selection, so
          // applying never files a bookmark under a blank name.
          for (const item of result.suggestions) if (item.collection) next.add(item.bookmarkId);
          return next;
        });
      } catch (err) {
        if (id !== runId.current) return;
        // Whatever came back before the failure is still worth reviewing.
        setError(err instanceof ApiError ? err.message : 'The filing run stopped early.');
        break;
      }
      setProgress({ done: Math.min(index + CHUNK, ids.length), total: ids.length });
    }

    if (id === runId.current) setStage('review');
  }, [plan, keptNames]);

  const toggleSelect = (id: number) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const collectionFor = (item: CategorySuggestion) =>
    edited.has(item.bookmarkId) ? (edited.get(item.bookmarkId) ?? '') : item.collection;

  const handleApply = async () => {
    const toApply = suggestions
      .filter((item) => selectedIds.has(item.bookmarkId))
      .map((item) => ({
        bookmarkId: item.bookmarkId,
        collectionName: collectionFor(item).trim() || undefined,
        tags: item.tags,
      }));

    if (toApply.length === 0) return;

    setApplying(true);
    try {
      const result = await api.applyBatchCategories(toApply);
      toast.success(`Filed ${pluralize(result.applied, 'bookmark')}.`);
      onApplied();
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Those could not be filed.');
    } finally {
      setApplying(false);
    }
  };

  const allSelected = suggestions.length > 0 && selectedIds.size === suggestions.length;
  const unplaced = suggestions.filter((item) => !collectionFor(item).trim()).length;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Sort bookmarks into collections"
      description={
        domainFilter
          ? `Uncollected bookmarks on ${domainFilter}`
          : bookmarkIds?.length
            ? `Sorting ${pluralize(bookmarkIds.length, 'selected bookmark')}`
            : 'Pocket plans the collections first, then files everything into them.'
      }
      footer={
        <>
          <Button onClick={onClose} disabled={applying}>
            {stage === 'review' ? 'Cancel' : 'Close'}
          </Button>
          {stage === 'plan' ? (
            <Button
              variant="primary"
              onClick={() => void startFiling()}
              disabled={!plan || keptNames.length === 0 || plan.bookmarkIds.length === 0}
            >
              Sort {plan ? pluralize(plan.bookmarkIds.length, 'bookmark') : ''}
            </Button>
          ) : null}
          {stage === 'review' ? (
            <Button
              variant="primary"
              onClick={() => void handleApply()}
              loading={applying}
              disabled={selectedIds.size === 0}
            >
              Apply {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
            </Button>
          ) : null}
        </>
      }
    >
      {stage === 'planning' ? (
        <Working
          title={bookmarkIds?.length ? 'Reading the selected bookmarks' : 'Reading the unfiled bookmarks'}
          detail="Working out the smallest set of collections that covers them."
        />
      ) : stage === 'filing' ? (
        <Working
          title={`Filing ${progress.done} of ${progress.total}`}
          detail={`Into ${pluralize(keptNames.length, 'collection')}: ${keptNames.join(', ')}`}
        />
      ) : null}

      {error && stage !== 'filing' ? (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-danger/40 bg-danger-soft px-3 py-2.5 text-[0.8125rem] text-danger">
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <p>{error}</p>
        </div>
      ) : null}

      {stage === 'plan' && plan ? (
        plan.collections.length === 0 ? (
          <p className="py-8 text-center text-ink-muted">
            {plan.totalUncollected === 0 && !bookmarkIds?.length
              ? 'Everything is filed already.'
              : 'No plan came back. Try again in a moment.'}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-[0.875rem] text-ink-muted">
              {pluralize(plan.bookmarkIds.length, 'bookmark')} will be filed into these{' '}
              {keptNames.length} collections. Remove any you do not want, then sort. Anything that
              fits none of them stays unfiled, with tags.
            </p>

            <ul className="flex flex-wrap gap-1.5">
              {plan.collections.map((item) => {
                const isDropped = dropped.has(item.name);
                return (
                  <li key={item.name}>
                    <button
                      type="button"
                      onClick={() =>
                        setDropped((current) => {
                          const next = new Set(current);
                          if (next.has(item.name)) next.delete(item.name);
                          else next.add(item.name);
                          return next;
                        })
                      }
                      title={item.description || item.name}
                      aria-pressed={!isDropped}
                      className={
                        isDropped
                          ? 'flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[0.8125rem] text-ink-faint line-through transition-colors hover:text-ink-muted'
                          : 'flex items-center gap-1.5 rounded-full border border-line-strong bg-raised px-3 py-1.5 text-[0.8125rem] text-ink transition-colors hover:border-accent'
                      }
                    >
                      {item.name}
                      {item.isNew ? (
                        <span className="text-[0.6875rem] text-accent">new</span>
                      ) : null}
                      <X size={13} aria-hidden className="text-ink-faint" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )
      ) : null}

      {stage === 'review' ? (
        suggestions.length === 0 ? (
          <p className="py-8 text-center text-ink-muted">Nothing came back to review.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5 text-[0.8125rem]">
              <span className="text-ink-muted">
                {suggestions.length} reviewed
                {unplaced > 0 ? `, ${unplaced} left unfiled` : ''}
              </span>
              <button
                type="button"
                onClick={() =>
                  setSelectedIds(
                    allSelected ? new Set() : new Set(suggestions.map((item) => item.bookmarkId)),
                  )
                }
                className="text-accent hover:underline focus:outline-none"
              >
                {allSelected ? 'Deselect all' : 'Select all'}
              </button>
            </div>

            <div className="flex flex-col gap-2">
              {suggestions.map((item) => (
                <CategorySuggestionRow
                  key={item.bookmarkId}
                  item={item}
                  selected={selectedIds.has(item.bookmarkId)}
                  collectionName={collectionFor(item)}
                  options={keptNames}
                  onToggle={toggleSelect}
                  onCollectionChange={(id, value) =>
                    setEdited((current) => new Map(current).set(id, value))
                  }
                />
              ))}
            </div>
          </div>
        )
      ) : null}
    </Dialog>
  );
}

function Working({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Sparkles className="h-8 w-8 animate-pulse text-accent" aria-hidden />
      <p className="mt-3 text-[0.9375rem] font-medium text-ink" aria-live="polite">
        {title}
      </p>
      <p className="mt-1 max-w-md text-[0.8125rem] text-ink-muted">{detail}</p>
    </div>
  );
}
