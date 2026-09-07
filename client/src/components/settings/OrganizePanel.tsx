import { useMemo, useState } from 'react';
import { Check, Hash, Merge, Pencil, Sparkles, Tag as TagIcon, Trash2, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ConfirmDialog';
import { MergeCollectionsDialog } from './MergeCollectionsDialog';
import { CollectionCleanupDialog } from './CollectionCleanupDialog';
import { UncollectedTriage } from './UncollectedTriage';
import { AiCategorizeDialog } from '../AiCategorizeDialog';
import { api, ApiError } from '../../lib/api';
import { useToast } from '../ui/Toaster';
import { pluralize } from '../../lib/format';
import type { Collection, CollectionSortKey, Tag } from '../../lib/types';

interface OrganizePanelProps {
  collections: Collection[];
  tags: Tag[];
  /** Hides every AI control when no OpenAI key is set. */
  aiConfigured: boolean;
  onChanged: () => void;
  onEditCollection: (collection: Collection) => void;
}

const ROW =
  'flex min-h-12 items-center gap-3 rounded-lg border border-transparent px-3 transition-colors hover:border-line hover:bg-surface';

export function OrganizePanel({
  collections,
  tags,
  aiConfigured,
  onChanged,
  onEditCollection,
}: OrganizePanelProps) {
  const toast = useToast();
  const [sortOrder, setSortOrder] = useState<CollectionSortKey>('count-desc');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [editingTag, setEditingTag] = useState<{ id: number; name: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<
    { kind: 'collection'; item: Collection } | { kind: 'tag'; item: Tag } | null
  >(null);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [pendingConvertTags, setPendingConvertTags] = useState<Collection[] | null>(null);
  const [pendingBulkDelete, setPendingBulkDelete] = useState<Collection[] | null>(null);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [aiTarget, setAiTarget] = useState<{ bookmarkIds?: number[]; domain?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const sortedCollections = useMemo(() => {
    const list = [...collections];
    if (sortOrder === 'count-desc') {
      return list.sort((a, b) => b.bookmarkCount - a.bookmarkCount || a.name.localeCompare(b.name));
    }
    if (sortOrder === 'count-asc') {
      return list.sort((a, b) => a.bookmarkCount - b.bookmarkCount || a.name.localeCompare(b.name));
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [collections, sortOrder]);

  const selectedCollections = useMemo(
    () => collections.filter((c) => selectedIds.has(c.id)),
    [collections, selectedIds],
  );

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === collections.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(collections.map((c) => c.id)));
    }
  };

  const commitRename = async () => {
    if (!editingTag) return;
    const name = editingTag.name.trim();
    if (!name) {
      setEditingTag(null);
      return;
    }
    try {
      await api.renameTag(editingTag.id, name);
      toast.success('Tag renamed.');
      onChanged();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'That tag could not be renamed.');
    } finally {
      setEditingTag(null);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      if (pendingDelete.kind === 'collection') {
        await api.deleteCollection(pendingDelete.item.id);
        toast.success('Collection deleted. Its bookmarks were kept.');
      } else {
        await api.deleteTag(pendingDelete.item.id);
        toast.success('Tag deleted.');
      }
      onChanged();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'That could not be deleted.');
    } finally {
      setBusy(false);
      setPendingDelete(null);
    }
  };

  const confirmConvertToTags = async () => {
    if (!pendingConvertTags || pendingConvertTags.length === 0) return;
    setBusy(true);
    try {
      const res = await api.convertCollectionsToTags(pendingConvertTags.map((c) => c.id));
      toast.success(
        `Converted ${pluralize(res.converted, 'collection')} to tags (${pluralize(res.bookmarksTagged, 'bookmark')} tagged).`,
      );
      setSelectedIds(new Set());
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not convert collections to tags.');
    } finally {
      setBusy(false);
      setPendingConvertTags(null);
    }
  };

  const confirmBulkDelete = async () => {
    if (!pendingBulkDelete || pendingBulkDelete.length === 0) return;
    setBusy(true);
    try {
      for (const item of pendingBulkDelete) {
        await api.deleteCollection(item.id);
      }
      toast.success(
        `Deleted ${pluralize(pendingBulkDelete.length, 'collection')}. Bookmarks were kept.`,
      );
      setSelectedIds(new Set());
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not delete collections.');
    } finally {
      setBusy(false);
      setPendingBulkDelete(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-[0.9375rem] font-semibold text-ink">Collections</h3>
            <p className="text-[0.875rem] text-ink-muted">
              Deleting a collection keeps its bookmarks. They just stop belonging to it.
            </p>
          </div>

          {collections.length > 1 ? (
            <div className="flex flex-wrap items-center gap-2 self-start text-[0.8125rem] sm:self-auto">
              {aiConfigured ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setCleanupOpen(true)}
                  className="text-[0.8125rem]"
                  title="Let the AI propose merges for collections that are really one subject"
                >
                  <Sparkles size={14} aria-hidden />
                  Tidy up with AI
                </Button>
              ) : null}
              <span className="text-ink-muted">Sort:</span>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as CollectionSortKey)}
                className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[0.8125rem] text-ink focus:border-accent focus:outline-none"
                aria-label="Sort collections"
              >
                <option value="count-desc">Most bookmarks</option>
                <option value="count-asc">Fewest bookmarks</option>
                <option value="name-asc">Name (A-Z)</option>
              </select>
            </div>
          ) : null}
        </div>

        {selectedIds.size > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-raised px-3 py-2 text-[0.875rem]">
            <div className="flex items-center gap-2">
              <span className="font-medium text-ink">
                {selectedIds.size} selected
              </span>
              <button
                type="button"
                onClick={toggleSelectAll}
                className="text-xs text-accent hover:underline focus:outline-none"
              >
                {selectedIds.size === collections.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setMergeDialogOpen(true)}
                className="text-[0.8125rem]"
              >
                <Merge size={14} aria-hidden />
                Merge
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPendingConvertTags(selectedCollections)}
                className="text-[0.8125rem]"
              >
                <TagIcon size={14} aria-hidden />
                Convert to tags
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPendingBulkDelete(selectedCollections)}
                className="text-[0.8125rem] hover:text-danger"
              >
                <Trash2 size={14} aria-hidden />
                Delete
              </Button>
            </div>
          </div>
        ) : null}

        {collections.length === 0 ? (
          <p className="py-2 text-[0.875rem] text-ink-faint">No collections yet.</p>
        ) : (
          <ul className="flex flex-col">
            {sortedCollections.map((collection) => (
              <li key={collection.id} className={ROW}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(collection.id)}
                  onChange={() => toggleSelect(collection.id)}
                  aria-label={`Select ${collection.name}`}
                  className="h-4 w-4 shrink-0 accent-[var(--color-accent)] cursor-pointer"
                />
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: collection.color ?? 'var(--color-line-strong)' }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9375rem] text-ink">{collection.name}</span>
                  <span className="block truncate text-[0.75rem] text-ink-faint">
                    {pluralize(collection.bookmarkCount, 'bookmark')}
                    {collection.description ? ` · ${collection.description}` : ''}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit ${collection.name}`}
                  onClick={() => onEditCollection(collection)}
                >
                  <Pencil size={15} aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${collection.name}`}
                  onClick={() => setPendingDelete({ kind: 'collection', item: collection })}
                  className="hover:text-danger"
                >
                  <Trash2 size={15} aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <UncollectedTriage
        collections={collections}
        aiConfigured={aiConfigured}
        onChanged={onChanged}
        onAiCategorize={(bookmarkIds, domain) => {
          setAiTarget({ bookmarkIds, domain });
          setAiDialogOpen(true);
        }}
      />

      <section className="flex flex-col gap-2 border-t border-line pt-6">
        <div>
          <h3 className="text-[0.9375rem] font-semibold text-ink">Tags</h3>
          <p className="text-[0.875rem] text-ink-muted">
            Renaming a tag to one that already exists merges the two.
          </p>
        </div>

        {tags.length === 0 ? (
          <p className="py-2 text-[0.875rem] text-ink-faint">No tags yet.</p>
        ) : (
          <ul className="flex flex-col">
            {tags.map((tag) => (
              <li key={tag.id} className={ROW}>
                <Hash size={15} className="shrink-0 text-ink-faint" aria-hidden />

                {editingTag?.id === tag.id ? (
                  <>
                    <input
                      value={editingTag.name}
                      autoFocus
                      aria-label={`New name for ${tag.name}`}
                      onChange={(event) => setEditingTag({ id: tag.id, name: event.target.value })}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void commitRename();
                        if (event.key === 'Escape') setEditingTag(null);
                      }}
                      className="min-w-0 flex-1 rounded-md border border-accent bg-canvas px-2 py-1.5 text-[0.9375rem] text-ink focus:outline-none"
                    />
                    <Button variant="ghost" size="icon" aria-label="Save name" onClick={() => void commitRename()}>
                      <Check size={16} aria-hidden />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="Cancel" onClick={() => setEditingTag(null)}>
                      <X size={16} aria-hidden />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate font-mono text-[0.875rem] text-ink">{tag.name}</span>
                    <span className="shrink-0 font-mono text-[0.75rem] text-ink-faint tabular-nums">
                      {tag.bookmarkCount}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Rename ${tag.name}`}
                      onClick={() => setEditingTag({ id: tag.id, name: tag.name })}
                    >
                      <Pencil size={15} aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${tag.name}`}
                      onClick={() => setPendingDelete({ kind: 'tag', item: tag })}
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
      </section>

      <CollectionCleanupDialog
        open={cleanupOpen}
        onClose={() => setCleanupOpen(false)}
        onApplied={onChanged}
      />

      <MergeCollectionsDialog
        open={mergeDialogOpen}
        sourceCollections={selectedCollections}
        allCollections={collections}
        onClose={() => setMergeDialogOpen(false)}
        onMerged={() => {
          setSelectedIds(new Set());
          onChanged();
        }}
      />

      <AiCategorizeDialog
        open={aiDialogOpen}
        bookmarkIds={aiTarget?.bookmarkIds}
        domainFilter={aiTarget?.domain}
        onClose={() => {
          setAiDialogOpen(false);
          setAiTarget(null);
        }}
        onApplied={() => {
          onChanged();
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        busy={busy}
        title={pendingDelete?.kind === 'collection' ? 'Delete collection?' : 'Delete tag?'}
        message={
          pendingDelete?.kind === 'collection'
            ? `"${pendingDelete.item.name}" will be removed. Its ${pluralize(pendingDelete.item.bookmarkCount, 'bookmark')} will stay in your library.`
            : `"${pendingDelete?.item.name}" will be removed from ${pluralize(pendingDelete?.item.bookmarkCount ?? 0, 'bookmark')}.`
        }
        confirmLabel="Delete"
        onConfirm={() => void confirmDelete()}
        onClose={() => setPendingDelete(null)}
      />

      <ConfirmDialog
        open={pendingConvertTags !== null}
        busy={busy}
        title={`Convert ${pluralize(pendingConvertTags?.length ?? 0, 'collection')} to tags?`}
        message={`Each collection name will become a tag linked to its bookmarks. The collections themselves will be removed.`}
        confirmLabel="Convert to tags"
        onConfirm={() => void confirmConvertToTags()}
        onClose={() => setPendingConvertTags(null)}
      />

      <ConfirmDialog
        open={pendingBulkDelete !== null}
        busy={busy}
        title={`Delete ${pluralize(pendingBulkDelete?.length ?? 0, 'collection')}?`}
        message={`All ${pluralize(pendingBulkDelete?.length ?? 0, 'selected collection')} will be removed. Their bookmarks will remain safely in your library.`}
        confirmLabel="Delete collections"
        onConfirm={() => void confirmBulkDelete()}
        onClose={() => setPendingBulkDelete(null)}
      />
    </div>
  );
}
