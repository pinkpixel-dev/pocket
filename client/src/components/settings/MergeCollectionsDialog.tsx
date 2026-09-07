import { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import clsx from 'clsx';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toaster';
import { api, ApiError } from '../../lib/api';
import type { Collection } from '../../lib/types';
import { pluralize } from '../../lib/format';

interface MergeCollectionsDialogProps {
  open: boolean;
  sourceCollections: Collection[];
  allCollections: Collection[];
  onClose: () => void;
  onMerged: () => void;
}

export function MergeCollectionsDialog({
  open,
  sourceCollections,
  allCollections,
  onClose,
  onMerged,
}: MergeCollectionsDialogProps) {
  const toast = useToast();
  const [selectedTargetId, setSelectedTargetId] = useState<number | 'new' | null>(null);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [busy, setBusy] = useState(false);

  const sourceIds = new Set(sourceCollections.map((c) => c.id));
  const candidateTargets = allCollections.filter((c) => !sourceIds.has(c.id));

  const totalBookmarksToMove = sourceCollections.reduce((acc, c) => acc + c.bookmarkCount, 0);

  const handleMerge = async () => {
    if (selectedTargetId === null) return;
    setBusy(true);

    try {
      let targetId: number;
      let targetName: string;

      if (selectedTargetId === 'new') {
        const name = newCollectionName.trim();
        if (!name) {
          toast.error('Please enter a name for the new collection.');
          setBusy(false);
          return;
        }
        const created = await api.createCollection({ name });
        targetId = created.collection.id;
        targetName = created.collection.name;
      } else {
        targetId = selectedTargetId;
        const found = allCollections.find((c) => c.id === targetId);
        targetName = found ? found.name : 'collection';
      }

      const res = await api.mergeCollections(
        sourceCollections.map((c) => c.id),
        targetId,
      );

      toast.success(
        `Merged ${pluralize(res.deletedCollections, 'collection')} (${pluralize(res.movedCount, 'bookmark')}) into "${targetName}".`,
      );
      onMerged();
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not merge collections.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title="Merge collections"
      description={`Move bookmarks from ${pluralize(sourceCollections.length, 'collection')} (${pluralize(totalBookmarksToMove, 'bookmark')}) into a single target.`}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleMerge}
            loading={busy}
            disabled={
              selectedTargetId === null ||
              (selectedTargetId === 'new' && !newCollectionName.trim())
            }
          >
            Merge into collection
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-[0.8125rem] font-medium text-ink-muted">
            Select target collection:
          </label>
          <div className="mt-2 flex max-h-56 flex-col gap-1 overflow-y-auto pr-1">
            {candidateTargets.map((collection) => (
              <button
                key={collection.id}
                type="button"
                onClick={() => setSelectedTargetId(collection.id)}
                className={clsx(
                  'flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-[0.875rem] transition-colors',
                  selectedTargetId === collection.id
                    ? 'bg-raised font-semibold text-ink'
                    : 'text-ink-muted hover:bg-surface hover:text-ink',
                )}
              >
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: collection.color ?? 'var(--color-line-strong)' }}
                />
                <span className="min-w-0 flex-1 truncate">{collection.name}</span>
                <span className="shrink-0 text-[0.75rem] text-ink-faint">
                  {pluralize(collection.bookmarkCount, 'bookmark')}
                </span>
                {selectedTargetId === collection.id ? (
                  <Check size={16} className="shrink-0 text-accent" aria-hidden />
                ) : null}
              </button>
            ))}

            <button
              type="button"
              onClick={() => setSelectedTargetId('new')}
              className={clsx(
                'flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-[0.875rem] transition-colors',
                selectedTargetId === 'new'
                  ? 'bg-raised font-semibold text-ink'
                  : 'text-ink-muted hover:bg-surface hover:text-ink',
              )}
            >
              <Plus size={16} className="shrink-0 text-accent" aria-hidden />
              <span className="min-w-0 flex-1">Create new collection...</span>
              {selectedTargetId === 'new' ? (
                <Check size={16} className="shrink-0 text-accent" aria-hidden />
              ) : null}
            </button>
          </div>
        </div>

        {selectedTargetId === 'new' ? (
          <div className="flex flex-col gap-1.5 pt-2 border-t border-line">
            <label htmlFor="new-collection-merge-input" className="text-[0.8125rem] text-ink-muted">
              New collection name:
            </label>
            <input
              id="new-collection-merge-input"
              type="text"
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              placeholder="e.g. Reference or Archive"
              autoFocus
              maxLength={80}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-[0.875rem] text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
            />
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
