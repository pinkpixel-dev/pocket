import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Check, Inbox, Plus, X } from 'lucide-react';
import { Dialog } from './ui/Dialog';
import { Button } from './ui/Button';
import type { Bookmark, Collection } from '../lib/types';

/** Stands in for a collection id while the name is still being typed. */
const NEW_COLLECTION = '__new' as const;

interface MoveDialogProps {
  open: boolean;
  bookmark: Bookmark | null;
  collections: Collection[];
  saving: boolean;
  onClose: () => void;
  /** A name is passed when the collection has to be created first. */
  onSubmit: (collectionId: number | null, newCollectionName?: string) => void;
}

export function MoveDialog({ open, bookmark, collections, saving, onClose, onSubmit }: MoveDialogProps) {
  const [selected, setSelected] = useState<number | typeof NEW_COLLECTION | null>(null);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (!open) return;
    setSelected(bookmark?.collectionId ?? null);
    setNewName('');
  }, [open, bookmark]);

  const creating = selected === NEW_COLLECTION;
  const trimmedName = newName.trim();

  const options: Array<{ id: number | null; name: string; color: string | null }> = [
    { id: null, name: 'No collection', color: null },
    ...collections.map((collection) => ({
      id: collection.id,
      name: collection.name,
      color: collection.color,
    })),
  ];

  const submit = () => {
    if (creating) {
      if (!trimmedName) return;
      onSubmit(null, trimmedName);
      return;
    }
    onSubmit(selected);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title="Move to collection"
      description={bookmark?.title || bookmark?.url}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            loading={saving}
            disabled={creating && !trimmedName}
          >
            {creating ? 'Create and move' : 'Move'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div role="radiogroup" aria-label="Collections" className="flex flex-col gap-1">
          {options.map((option) => (
            <button
              key={option.id ?? 'none'}
              type="button"
              role="radio"
              aria-checked={selected === option.id}
              onClick={() => setSelected(option.id)}
              className={clsx(
                'flex min-h-12 items-center gap-3 rounded-lg px-3 text-left text-[0.9375rem] transition-colors',
                selected === option.id
                  ? 'bg-raised font-semibold text-ink'
                  : 'text-ink-muted hover:bg-surface hover:text-ink',
              )}
            >
              {option.id === null ? (
                <Inbox size={16} className="shrink-0 text-ink-faint" aria-hidden />
              ) : (
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: option.color ?? 'var(--color-line-strong)' }}
                />
              )}
              <span className="min-w-0 flex-1 truncate">{option.name}</span>
              {selected === option.id ? <Check size={16} className="shrink-0 text-accent" aria-hidden /> : null}
            </button>
          ))}

          <button
            type="button"
            role="radio"
            aria-checked={creating}
            onClick={() => setSelected(NEW_COLLECTION)}
            className={clsx(
              'flex min-h-12 items-center gap-3 rounded-lg px-3 text-left text-[0.9375rem] transition-colors',
              creating ? 'bg-raised font-semibold text-ink' : 'text-ink-muted hover:bg-surface hover:text-ink',
            )}
          >
            <Plus size={16} className="shrink-0 text-accent" aria-hidden />
            <span className="min-w-0 flex-1 truncate">Create new collection...</span>
            {creating ? <Check size={16} className="shrink-0 text-accent" aria-hidden /> : null}
          </button>
        </div>

        {creating ? (
          <div className="flex items-end gap-2 border-t border-line pt-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <label htmlFor="move-new-collection" className="text-[0.8125rem] text-ink-muted">
                New collection name
              </label>
              <input
                id="move-new-collection"
                type="text"
                autoFocus
                maxLength={80}
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && trimmedName) submit();
                }}
                placeholder="Models, Recipes, Reading..."
                className="h-11 rounded-lg border border-line bg-surface px-3 text-[0.9375rem] text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
              />
            </div>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Cancel creating a collection"
              onClick={() => {
                setSelected(bookmark?.collectionId ?? null);
                setNewName('');
              }}
            >
              <X size={16} aria-hidden />
            </Button>
          </div>
        ) : null}

        {collections.length === 0 && !creating ? (
          <p className="text-[0.8125rem] text-ink-faint">
            No collections yet. Create the first one right here.
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
