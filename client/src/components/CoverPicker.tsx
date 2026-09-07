import { useEffect, useRef, useState, type DragEvent } from 'react';
import clsx from 'clsx';
import { ImageUp, Link2, Loader2, Trash2 } from 'lucide-react';
import { Button } from './ui/Button';
import { api, ApiError } from '../lib/api';
import type { Bookmark } from '../lib/types';

interface CoverPickerProps {
  bookmark: Bookmark;
  /** Hands the saved bookmark back so the card behind the dialog updates. */
  onChanged: (bookmark: Bookmark) => void;
  /** Set when the dialog was opened from "Change cover" on a card. */
  autoFocus?: boolean;
}

/**
 * Covers save on their own, separately from the rest of the form. Waiting for
 * "Save changes" would mean holding an upload in memory for no reason, and it
 * would make the thumbnail lie about what is stored.
 */
export function CoverPicker({ bookmark, onChanged, autoFocus = false }: CoverPickerProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [dragging, setDragging] = useState(false);

  const fileInput = useRef<HTMLInputElement>(null);
  const uploadButton = useRef<HTMLButtonElement>(null);
  const section = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!autoFocus) return;
    section.current?.scrollIntoView({ block: 'center' });
    uploadButton.current?.focus();
  }, [autoFocus]);

  const run = async (work: () => Promise<{ bookmark: Bookmark }>, failure: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await work();
      onChanged(result.bookmark);
      setImageUrl('');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : failure);
    } finally {
      setBusy(false);
    }
  };

  const upload = (file: File) => void run(() => api.uploadCover(bookmark.id, file), 'That image could not be saved.');

  const useLink = () => {
    const trimmed = imageUrl.trim();
    if (!trimmed) return;
    void run(() => api.setCoverFromUrl(bookmark.id, trimmed), 'That image could not be downloaded.');
  };

  const clear = () => void run(() => api.removeCover(bookmark.id), 'That cover could not be removed.');

  /** A file dropped from the desktop, or an image dragged out of another tab. */
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (busy) return;

    const file = event.dataTransfer.files[0];
    if (file) {
      upload(file);
      return;
    }

    const dropped = event.dataTransfer.getData('text/uri-list') || event.dataTransfer.getData('text/plain');
    if (dropped.trim()) {
      void run(
        () => api.setCoverFromUrl(bookmark.id, dropped.trim()),
        'That image could not be downloaded.',
      );
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[0.8125rem] font-semibold text-ink-muted">Cover</span>

      <div
        ref={section}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={clsx(
          'flex gap-3 rounded-lg border border-dashed p-2.5 transition-colors duration-150',
          dragging ? 'border-accent bg-accent-soft' : 'border-line',
        )}
      >
        <div className="relative aspect-16/10 w-24 shrink-0 overflow-hidden rounded-md bg-raised sm:w-28">
          {bookmark.previewUrl ? (
            <img src={bookmark.previewUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="grid h-full w-full place-items-center text-ink-faint">
              <ImageUp size={18} aria-hidden />
            </span>
          )}
          {busy ? (
            <span className="absolute inset-0 grid place-items-center bg-canvas/60">
              <Loader2 size={16} className="animate-spin text-ink-muted" aria-hidden />
            </span>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Button
              ref={uploadButton}
              onClick={() => fileInput.current?.click()}
              disabled={busy}
              title="Choose an image from this device"
            >
              <ImageUp size={15} aria-hidden />
              {bookmark.coverUrl ? 'Replace' : 'Upload'}
            </Button>

            {bookmark.coverUrl ? (
              <Button
                variant="ghost"
                onClick={clear}
                disabled={busy}
                title="Remove this cover and go back to the fetched preview"
              >
                <Trash2 size={15} aria-hidden />
                Remove
              </Button>
            ) : null}
          </div>

          <div className="flex gap-2">
            <input
              type="url"
              inputMode="url"
              autoCapitalize="none"
              spellCheck={false}
              value={imageUrl}
              disabled={busy}
              placeholder="Or paste an image link"
              aria-label="Image link"
              onChange={(event) => setImageUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                // Enter here sets the cover; it must not submit the whole form.
                event.preventDefault();
                useLink();
              }}
              className="min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3 text-[0.8125rem] text-ink transition-colors placeholder:text-ink-faint hover:border-line-strong focus:border-accent focus:outline-none disabled:opacity-60"
            />
            <Button
              onClick={useLink}
              disabled={busy || !imageUrl.trim()}
              title="Download this image and use it as the cover"
            >
              <Link2 size={15} aria-hidden />
              Use
            </Button>
          </div>
        </div>

        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Reset first, so picking the same file twice still fires a change.
            event.target.value = '';
            if (file) upload(file);
          }}
        />
      </div>

      {error ? (
        <p role="alert" className="flex items-start gap-1.5 text-[0.8125rem] text-danger">
          <span aria-hidden>!</span>
          {error}
        </p>
      ) : (
        <p className="text-[0.8125rem] text-ink-faint">
          {bookmark.coverUrl
            ? 'This cover is saved. Removing it brings back the preview Pocket fetched.'
            : 'Drop an image here, upload one, or paste a link. Covers save straight away.'}
        </p>
      )}
    </div>
  );
}
