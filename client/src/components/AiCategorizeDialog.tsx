import { useEffect, useState } from 'react';
import { Sparkles, Globe, Tag as TagIcon, AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import { Dialog } from './ui/Dialog';
import { Button } from './ui/Button';
import { useToast } from './ui/Toaster';
import { api, ApiError } from '../lib/api';
import type { CategorySuggestion } from '../lib/types';
import { pluralize } from '../lib/format';

interface AiCategorizeDialogProps {
  open: boolean;
  onClose: () => void;
  onApplied: () => void;
  bookmarkIds?: number[];
  domainFilter?: string;
}

export function AiCategorizeDialog({
  open,
  onClose,
  onApplied,
  bookmarkIds,
  domainFilter,
}: AiCategorizeDialogProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<CategorySuggestion[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [editedCollections, setEditedCollections] = useState<Map<number, string>>(new Map());

  useEffect(() => {
    if (!open) {
      setSuggestions([]);
      setSelectedIds(new Set());
      setEditedCollections(new Map());
      setError(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    api
      .suggestBatchCategories({
        limit: 30,
        bookmarkIds: bookmarkIds && bookmarkIds.length > 0 ? bookmarkIds : undefined,
      })
      .then((res) => {
        if (!isMounted) return;
        setSuggestions(res.suggestions);
        setSelectedIds(new Set(res.suggestions.map((s) => s.bookmarkId)));
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err instanceof ApiError ? err.message : 'Could not generate AI suggestions.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [open, bookmarkIds]);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === suggestions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(suggestions.map((s) => s.bookmarkId)));
    }
  };

  const handleCollectionChange = (id: number, val: string) => {
    setEditedCollections((prev) => {
      const next = new Map(prev);
      next.set(id, val);
      return next;
    });
  };

  const handleApply = async () => {
    const toApply = suggestions.filter((s) => selectedIds.has(s.bookmarkId));
    if (toApply.length === 0) return;

    setApplying(true);
    try {
      const assignments = toApply.map((item) => ({
        bookmarkId: item.bookmarkId,
        collectionName:
          editedCollections.get(item.bookmarkId)?.trim() || item.collection.trim() || undefined,
        tags: item.tags,
      }));

      const res = await api.applyBatchCategories(assignments);
      toast.success(`Categorized ${pluralize(res.applied, 'bookmark')}.`);
      onApplied();
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to apply categorization.');
    } finally {
      setApplying(false);
    }
  };

  const allSelected = suggestions.length > 0 && selectedIds.size === suggestions.length;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="AI collection categorization"
      description={
        domainFilter
          ? `Review suggested collections for uncollected bookmarks on ${domainFilter}`
          : 'Review suggested collections for uncollected bookmarks'
      }
      footer={
        <>
          <Button onClick={onClose} disabled={applying}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleApply}
            loading={applying}
            disabled={loading || selectedIds.size === 0}
          >
            Apply {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
          </Button>
        </>
      }
    >
      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Sparkles className="h-8 w-8 animate-pulse text-accent" aria-hidden />
          <p className="mt-3 text-[0.9375rem] font-medium text-ink">Analyzing bookmarks with AI...</p>
          <p className="mt-1 text-[0.8125rem] text-ink-muted">
            Finding existing collections or creating relevant ones.
          </p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <AlertCircle className="h-8 w-8 text-danger" aria-hidden />
          <p className="mt-2 text-[0.9375rem] font-medium text-ink">AI categorization failed</p>
          <p className="mt-1 max-w-md text-[0.8125rem] text-ink-muted">{error}</p>
        </div>
      ) : suggestions.length === 0 ? (
        <div className="py-8 text-center text-ink-muted">
          No uncollected bookmarks found to categorize.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-line pb-2.5 text-[0.8125rem]">
            <span className="text-ink-muted">
              {suggestions.length} suggestions ready to review
            </span>
            <button
              type="button"
              onClick={toggleAll}
              className="text-accent hover:underline focus:outline-none"
            >
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {suggestions.map((item) => {
              const isSelected = selectedIds.has(item.bookmarkId);
              const currentCollection = editedCollections.has(item.bookmarkId)
                ? editedCollections.get(item.bookmarkId)!
                : item.collection;

              return (
                <div
                  key={item.bookmarkId}
                  className={clsx(
                    'flex flex-col gap-2 rounded-xl border p-3 transition-colors sm:flex-row sm:items-center sm:justify-between',
                    isSelected
                      ? 'border-line-strong bg-raised'
                      : 'border-line bg-surface opacity-60 hover:opacity-100',
                  )}
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(item.bookmarkId)}
                      aria-label={`Select ${item.currentTitle}`}
                      className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[0.875rem] font-medium text-ink">
                          {item.currentTitle}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[0.75rem] text-ink-muted">
                        <span className="flex items-center gap-1">
                          <Globe size={12} className="shrink-0 text-ink-faint" aria-hidden />
                          {item.domain || item.url}
                        </span>
                        {item.tags.length > 0 ? (
                          <span className="flex items-center gap-1">
                            <TagIcon size={12} className="shrink-0 text-ink-faint" aria-hidden />
                            {item.tags.join(', ')}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pl-7 sm:pl-0">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={currentCollection}
                          onChange={(e) => handleCollectionChange(item.bookmarkId, e.target.value)}
                          placeholder="Collection name"
                          className="w-36 rounded-lg border border-line bg-surface px-2.5 py-1 text-[0.8125rem] text-ink focus:border-accent focus:outline-none sm:w-44"
                          aria-label={`Collection for ${item.currentTitle}`}
                        />
                        {item.isNew ? (
                          <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[0.6875rem] font-medium text-accent">
                            New
                          </span>
                        ) : null}
                      </div>
                      <span className="text-[0.6875rem] text-ink-faint capitalize">
                        Confidence: {item.confidence}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Dialog>
  );
}
