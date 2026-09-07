import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Check, Inbox } from 'lucide-react';
import { Dialog } from './ui/Dialog';
import { Button } from './ui/Button';
import type { Bookmark, Collection } from '../lib/types';

interface MoveDialogProps {
  open: boolean;
  bookmark: Bookmark | null;
  collections: Collection[];
  saving: boolean;
  onClose: () => void;
  onSubmit: (collectionId: number | null) => void;
}

export function MoveDialog({ open, bookmark, collections, saving, onClose, onSubmit }: MoveDialogProps) {
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    if (open) setSelected(bookmark?.collectionId ?? null);
  }, [open, bookmark]);

  const options: Array<{ id: number | null; name: string; color: string | null }> = [
    { id: null, name: 'No collection', color: null },
    ...collections.map((collection) => ({
      id: collection.id,
      name: collection.name,
      color: collection.color,
    })),
  ];

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
          <Button variant="primary" onClick={() => onSubmit(selected)} loading={saving}>
            Move
          </Button>
        </>
      }
    >
      {collections.length === 0 ? (
        <p className="text-[0.9375rem] text-ink-muted">
          There are no collections yet. Create one from the sidebar, then move links into it.
        </p>
      ) : (
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
        </div>
      )}
    </Dialog>
  );
}
