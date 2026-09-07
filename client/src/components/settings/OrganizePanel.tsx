import { useState } from 'react';
import { Check, Hash, Pencil, Trash2, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ConfirmDialog';
import { api, ApiError } from '../../lib/api';
import { useToast } from '../ui/Toaster';
import { pluralize } from '../../lib/format';
import type { Collection, Tag } from '../../lib/types';

interface OrganizePanelProps {
  collections: Collection[];
  tags: Tag[];
  onChanged: () => void;
  onEditCollection: (collection: Collection) => void;
}

const ROW =
  'flex min-h-12 items-center gap-3 rounded-lg border border-transparent px-3 transition-colors hover:border-line hover:bg-surface';

export function OrganizePanel({ collections, tags, onChanged, onEditCollection }: OrganizePanelProps) {
  const toast = useToast();
  const [editingTag, setEditingTag] = useState<{ id: number; name: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<
    { kind: 'collection'; item: Collection } | { kind: 'tag'; item: Tag } | null
  >(null);
  const [busy, setBusy] = useState(false);

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

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <div>
          <h3 className="text-[0.9375rem] font-semibold text-ink">Collections</h3>
          <p className="text-[0.875rem] text-ink-muted">
            Deleting a collection keeps its bookmarks. They just stop belonging to it.
          </p>
        </div>

        {collections.length === 0 ? (
          <p className="py-2 text-[0.875rem] text-ink-faint">No collections yet.</p>
        ) : (
          <ul className="flex flex-col">
            {collections.map((collection) => (
              <li key={collection.id} className={ROW}>
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
    </div>
  );
}
