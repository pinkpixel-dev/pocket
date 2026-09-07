import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import { Dialog } from './ui/Dialog';
import { Button } from './ui/Button';
import { SelectField, TextArea, TextField } from './ui/Field';
import { TagInput } from './TagInput';
import type { Bookmark, BookmarkDraft, Collection, Tag } from '../lib/types';

export type FormMode = 'create' | 'edit';

interface BookmarkFormDialogProps {
  open: boolean;
  mode: FormMode;
  bookmark?: Bookmark | null;
  collections: Collection[];
  tags: Tag[];
  /** Prefills the collection when adding from inside a collection view. */
  defaultCollectionId?: number | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (draft: BookmarkDraft) => void;
}

const EMPTY: BookmarkDraft = {
  url: '',
  title: '',
  description: '',
  collectionId: null,
  newCollectionName: null,
  tags: [],
  isPinned: false,
};

/** Sentinel for the extra <option>. No real collection can have this id. */
const NEW_COLLECTION = '__new';

export function BookmarkFormDialog({
  open,
  mode,
  bookmark,
  collections,
  tags,
  defaultCollectionId = null,
  saving,
  error,
  onClose,
  onSubmit,
}: BookmarkFormDialogProps) {
  const [draft, setDraft] = useState<BookmarkDraft>(EMPTY);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (!open) return;

    if (mode === 'edit' && bookmark) {
      setDraft({
        url: bookmark.url,
        title: bookmark.title,
        description: bookmark.description,
        collectionId: bookmark.collectionId,
        newCollectionName: null,
        tags: bookmark.tags,
        isPinned: bookmark.isPinned,
      });
      setShowDetails(true);
      return;
    }

    setDraft({ ...EMPTY, collectionId: defaultCollectionId });
    setShowDetails(false);
  }, [open, mode, bookmark, defaultCollectionId]);

  const update = <K extends keyof BookmarkDraft>(key: K, value: BookmarkDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const creatingCollection = draft.newCollectionName !== null;

  const chooseCollection = (value: string) => {
    if (value === NEW_COLLECTION) {
      setDraft((current) => ({ ...current, collectionId: null, newCollectionName: '' }));
      return;
    }
    setDraft((current) => ({
      ...current,
      collectionId: value ? Number(value) : null,
      newCollectionName: null,
    }));
  };

  const submit = () => {
    if (!draft.url.trim()) return;
    onSubmit(draft);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={mode === 'create' ? 'Save a link' : 'Edit bookmark'}
      description={
        mode === 'create'
          ? 'Paste a URL. Pocket fetches the title and preview in the background.'
          : undefined
      }
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={saving} disabled={!draft.url.trim()}>
            {mode === 'create' ? 'Save link' : 'Save changes'}
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
          label="URL"
          type="url"
          inputMode="url"
          autoComplete="url"
          autoCapitalize="none"
          spellCheck={false}
          // Autofocus is right here: the dialog exists to receive a pasted link.
          autoFocus={mode === 'create'}
          placeholder="https://example.com/article"
          value={draft.url}
          error={error}
          onChange={(event) => update('url', event.target.value)}
        />

        {mode === 'create' ? (
          <button
            type="button"
            onClick={() => setShowDetails((value) => !value)}
            aria-expanded={showDetails}
            className="-mx-1 flex items-center gap-1.5 self-start rounded-md px-1 py-1 text-[0.875rem] font-semibold text-ink-muted transition-colors hover:text-ink"
          >
            {showDetails ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
            Add details now
          </button>
        ) : null}

        {showDetails ? (
          <>
            <TextField
              label="Title"
              placeholder={mode === 'create' ? 'Left empty, Pocket fills this in' : ''}
              value={draft.title}
              maxLength={300}
              onChange={(event) => update('title', event.target.value)}
            />

            <TextArea
              label="Description"
              rows={3}
              maxLength={600}
              placeholder="A note about why this is worth keeping."
              value={draft.description}
              onChange={(event) => update('description', event.target.value)}
            />

            <div className="flex flex-col gap-2">
              <SelectField
                label="Collection"
                value={
                  creatingCollection
                    ? NEW_COLLECTION
                    : draft.collectionId === null
                      ? ''
                      : String(draft.collectionId)
                }
                onChange={(event) => chooseCollection(event.target.value)}
              >
                <option value="">No collection</option>
                {collections.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.name}
                  </option>
                ))}
                <option value={NEW_COLLECTION}>+ Create new collection</option>
              </SelectField>

              {creatingCollection ? (
                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <TextField
                      label="New collection name"
                      autoFocus
                      maxLength={80}
                      placeholder="Models, Recipes, Reading..."
                      value={draft.newCollectionName ?? ''}
                      hint="Created when you save. Leaving it blank saves the link with no collection."
                      onChange={(event) => update('newCollectionName', event.target.value)}
                      onKeyDown={(event) => {
                        // Enter inside a sub-field should not submit the whole form.
                        if (event.key === 'Enter') event.preventDefault();
                      }}
                    />
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Cancel creating a collection"
                    className="mb-7"
                    onClick={() => chooseCollection('')}
                  >
                    <X size={16} aria-hidden />
                  </Button>
                </div>
              ) : null}
            </div>

            <TagInput value={draft.tags} onChange={(value) => update('tags', value)} suggestions={tags} />

            <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[0.875rem] text-ink">
              <input
                type="checkbox"
                checked={draft.isPinned}
                onChange={(event) => update('isPinned', event.target.checked)}
                className="h-4.5 w-4.5 shrink-0 accent-[var(--color-accent)]"
              />
              Pin this to the top of the library
            </label>
          </>
        ) : null}

        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden>
          Save
        </button>
      </form>
    </Dialog>
  );
}
