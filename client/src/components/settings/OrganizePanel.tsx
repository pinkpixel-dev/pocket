import { useMemo, useState } from 'react';
import { Merge, Pencil, Sparkles, Tag as TagIcon, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ConfirmDialog';
import { MergeCollectionsDialog } from './MergeCollectionsDialog';
import { CollectionCleanupDialog } from './CollectionCleanupDialog';
import { TagsSection } from './TagsSection';
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
  const [pendingDelete, setPendingDelete] = useState<Collection | null>(null);
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

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      await api.deleteCollection(pendingDelete.id);
      toast.success('Collection deleted. Its bookmarks were kept.');
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
                  onClick={() => setPendingDelete(collection)}
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

      <TagsSection tags={tags} aiConfigured={aiConfigured} onChanged={onChanged} />

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
        title="Delete collection?"
        message={`"${pendingDelete?.name}" will be removed. Its ${pluralize(pendingDelete?.bookmarkCount ?? 0, 'bookmark')} will stay in your library.`}
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
