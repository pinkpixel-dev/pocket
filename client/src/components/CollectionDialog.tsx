import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Dialog } from './ui/Dialog';
import { Button } from './ui/Button';
import { TextArea, TextField } from './ui/Field';
import type { Collection } from '../lib/types';

/** A small fixed set keeps collections distinguishable without a colour picker. */
const SWATCHES = [
  '#e2a33c',
  '#d9714b',
  '#c25c63',
  '#8f9b5c',
  '#5f9e8f',
  '#6c8ab0',
  '#9a7fae',
  '#8a8175',
];

interface CollectionDialogProps {
  open: boolean;
  collection: Collection | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (input: { name: string; description: string | null; color: string | null }) => void;
}

export function CollectionDialog({
  open,
  collection,
  saving,
  error,
  onClose,
  onSubmit,
}: CollectionDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(collection?.name ?? '');
    setDescription(collection?.description ?? '');
    setColor(collection?.color ?? SWATCHES[0]!);
  }, [open, collection]);

  const submit = () => {
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), description: description.trim() || null, color });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title={collection ? 'Edit collection' : 'New collection'}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={saving} disabled={!name.trim()}>
            {collection ? 'Save changes' : 'Create collection'}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="flex flex-col gap-4"
      >
        <TextField
          label="Name"
          autoFocus
          maxLength={80}
          placeholder="Reading list"
          value={name}
          error={error}
          onChange={(event) => setName(event.target.value)}
        />

        <TextArea
          label="Description"
          rows={2}
          maxLength={300}
          placeholder="Optional. What belongs in here?"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />

        <fieldset className="flex flex-col gap-2">
          <legend className="text-[0.8125rem] font-semibold text-ink-muted">Colour</legend>
          <div className="flex flex-wrap gap-2">
            {SWATCHES.map((swatch) => (
              <button
                key={swatch}
                type="button"
                onClick={() => setColor(swatch)}
                aria-pressed={color === swatch}
                aria-label={`Use colour ${swatch}`}
                className={clsx(
                  'h-9 w-9 rounded-lg border-2 transition-transform duration-150',
                  color === swatch ? 'border-ink' : 'border-transparent hover:border-line-strong',
                )}
                style={{ backgroundColor: swatch }}
              />
            ))}
          </div>
        </fieldset>

        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden>
          Save
        </button>
      </form>
    </Dialog>
  );
}
