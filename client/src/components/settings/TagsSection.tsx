import { useMemo, useState } from 'react';
import { Check, Hash, Merge, Pencil, Sparkles, Trash2, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { ConfirmDialog } from '../ConfirmDialog';
import { TagCleanupDialog } from './TagCleanupDialog';
import { api, ApiError } from '../../lib/api';
import { useToast } from '../ui/Toaster';
import { pluralize } from '../../lib/format';
import type { Tag } from '../../lib/types';

interface TagsSectionProps {
  tags: Tag[];
  /** Hides the AI control when no OpenAI key is set. */
  aiConfigured: boolean;
  onChanged: () => void;
}

const ROW =
  'flex min-h-12 items-center gap-3 rounded-lg border border-transparent px-3 transition-colors hover:border-line hover:bg-surface';

/** A tag list gets long and repetitive, so it needs the same bulk tools as collections. */
export function TagsSection({ tags, aiConfigured, onChanged }: TagsSectionProps) {
  const toast = useToast();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Tag | null>(null);
  const [bulkDelete, setBulkDelete] = useState<Tag[] | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeTarget, setMergeTarget] = useState('');
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const selected = useMemo(() => tags.filter((tag) => selectedIds.has(tag.id)), [tags, selectedIds]);

  const toggle = (id: number) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const commitRename = async () => {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) {
      setEditing(null);
      return;
    }
    try {
      await api.renameTag(editing.id, name);
      toast.success('Tag renamed.');
      onChanged();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'That tag could not be renamed.');
    } finally {
      setEditing(null);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      await api.deleteTag(pendingDelete.id);
      toast.success('Tag deleted.');
      onChanged();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'That tag could not be deleted.');
    } finally {
      setBusy(false);
      setPendingDelete(null);
    }
  };

  const confirmBulkDelete = async () => {
    if (!bulkDelete || bulkDelete.length === 0) return;
    setBusy(true);
    try {
      const result = await api.bulkDeleteTags(bulkDelete.map((tag) => tag.id));
      toast.success(`Deleted ${pluralize(result.deleted, 'tag')}.`);
      setSelectedIds(new Set());
      onChanged();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Those tags could not be deleted.');
    } finally {
      setBusy(false);
      setBulkDelete(null);
    }
  };

  const openMerge = () => {
    // The busiest of the picked tags is nearly always the one to keep.
    setMergeTarget(selected[0]?.name ?? '');
    setMergeOpen(true);
  };

  const confirmMerge = async () => {
    const target = mergeTarget.trim();
    if (!target || selected.length === 0) return;
    setBusy(true);
    try {
      const result = await api.mergeTags(
        selected.map((tag) => tag.id),
        target,
      );
      toast.success(`Merged ${pluralize(result.merged, 'tag')} into "${target}".`);
      setSelectedIds(new Set());
      setMergeOpen(false);
      onChanged();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Those tags could not be merged.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-2 border-t border-line pt-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-[0.9375rem] font-semibold text-ink">Tags</h3>
          <p className="text-[0.875rem] text-ink-muted">
            Renaming a tag to one that already exists merges the two.
          </p>
        </div>

        {aiConfigured && tags.length > 1 ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setCleanupOpen(true)}
            className="self-start text-[0.8125rem] sm:self-auto"
            title="Let the AI fold synonyms and plurals together"
          >
            <Sparkles size={14} aria-hidden />
            Tidy up with AI
          </Button>
        ) : null}
      </div>

      {selectedIds.size > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-raised px-3 py-2 text-[0.875rem]">
          <div className="flex items-center gap-2">
            <span className="font-medium text-ink">{selectedIds.size} selected</span>
            <button
              type="button"
              onClick={() =>
                setSelectedIds(
                  selectedIds.size === tags.length ? new Set() : new Set(tags.map((tag) => tag.id)),
                )
              }
              className="text-xs text-accent hover:underline focus:outline-none"
            >
              {selectedIds.size === tags.length ? 'Deselect all' : 'Select all'}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={openMerge} className="text-[0.8125rem]">
              <Merge size={14} aria-hidden />
              Merge
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setBulkDelete(selected)}
              className="text-[0.8125rem] hover:text-danger"
            >
              <Trash2 size={14} aria-hidden />
              Delete
            </Button>
          </div>
        </div>
      ) : null}

      {tags.length === 0 ? (
        <p className="py-2 text-[0.875rem] text-ink-faint">No tags yet.</p>
      ) : (
        <ul className="flex flex-col">
          {tags.map((tag) => (
            <li key={tag.id} className={ROW}>
              <input
                type="checkbox"
                checked={selectedIds.has(tag.id)}
                onChange={() => toggle(tag.id)}
                aria-label={`Select ${tag.name}`}
                className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--color-accent)]"
              />
              <Hash size={15} className="shrink-0 text-ink-faint" aria-hidden />

              {editing?.id === tag.id ? (
                <>
                  <input
                    value={editing.name}
                    autoFocus
                    aria-label={`New name for ${tag.name}`}
                    onChange={(event) => setEditing({ id: tag.id, name: event.target.value })}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void commitRename();
                      if (event.key === 'Escape') setEditing(null);
                    }}
                    className="min-w-0 flex-1 rounded-md border border-accent bg-canvas px-2 py-1.5 text-[0.9375rem] text-ink focus:outline-none"
                  />
                  <Button variant="ghost" size="icon" aria-label="Save name" onClick={() => void commitRename()}>
                    <Check size={16} aria-hidden />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Cancel" onClick={() => setEditing(null)}>
                    <X size={16} aria-hidden />
                  </Button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate font-mono text-[0.875rem] text-ink">
                    {tag.name}
                  </span>
                  <span className="shrink-0 font-mono text-[0.75rem] text-ink-faint tabular-nums">
                    {tag.bookmarkCount}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Rename ${tag.name}`}
                    onClick={() => setEditing({ id: tag.id, name: tag.name })}
                  >
                    <Pencil size={15} aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${tag.name}`}
                    onClick={() => setPendingDelete(tag)}
                    className="hover:text-danger"
                  >
                    <Trash2 size={15} aria-hidden />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <TagCleanupDialog
        open={cleanupOpen}
        onClose={() => setCleanupOpen(false)}
        onApplied={onChanged}
      />

      <Dialog
        open={mergeOpen}
        onClose={() => setMergeOpen(false)}
        size="sm"
        title="Merge tags"
        description={`${pluralize(selected.length, 'tag')} will become one. Bookmarks keep the name you choose.`}
        footer={
          <>
            <Button onClick={() => setMergeOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => void confirmMerge()}
              loading={busy}
              disabled={!mergeTarget.trim()}
            >
              Merge
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-1.5">
            {selected.map((tag) => (
              <span
                key={tag.id}
                className="rounded-md bg-raised px-1.5 py-0.5 font-mono text-[0.8125rem] text-ink-muted"
              >
                {tag.name}
              </span>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="tag-merge-target" className="text-[0.8125rem] text-ink-muted">
              Keep them all as
            </label>
            <input
              id="tag-merge-target"
              type="text"
              value={mergeTarget}
              maxLength={60}
              autoFocus
              onChange={(event) => setMergeTarget(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && mergeTarget.trim()) void confirmMerge();
              }}
              className="h-11 rounded-lg border border-line bg-surface px-3 font-mono text-[0.9375rem] text-ink focus:border-accent focus:outline-none"
            />
            <p className="text-[0.75rem] text-ink-faint">
              A name the library does not have yet is created. Anything else folds into the tag that
              already owns it.
            </p>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        busy={busy}
        title="Delete tag?"
        message={`"${pendingDelete?.name}" will be removed from ${pluralize(pendingDelete?.bookmarkCount ?? 0, 'bookmark')}.`}
        confirmLabel="Delete"
        onConfirm={() => void confirmDelete()}
        onClose={() => setPendingDelete(null)}
      />

      <ConfirmDialog
        open={bulkDelete !== null}
        busy={busy}
        title={`Delete ${pluralize(bulkDelete?.length ?? 0, 'tag')}?`}
        message="The bookmarks stay exactly as they are. They just lose these tags."
        confirmLabel="Delete tags"
        onConfirm={() => void confirmBulkDelete()}
        onClose={() => setBulkDelete(null)}
      />
    </section>
  );
}
