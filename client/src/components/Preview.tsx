import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';
import { domainHue, initialsFor } from '../lib/format';
import type { Bookmark } from '../lib/types';

interface PreviewProps {
  bookmark: Bookmark;
  className?: string;
  /** List rows use a small square; grid cards use the full 16:10 area. */
  compact?: boolean;
}

/**
 * The preview area always fills, whether or not an image was found. A tinted
 * block keyed to the domain keeps a wall of image-less cards from looking broken.
 */
export function Preview({ bookmark, className, compact = false }: PreviewProps) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [bookmark.previewUrl]);

  const showImage = Boolean(bookmark.previewUrl) && !failed;
  const hue = domainHue(bookmark.domain || bookmark.siteName);
  const isWorking = bookmark.metadataStatus === 'pending';

  return (
    <div
      className={clsx('relative overflow-hidden bg-raised', className)}
      style={showImage ? undefined : { backgroundColor: `oklch(0.30 0.035 ${hue})` }}
    >
      {showImage ? (
        <img
          src={bookmark.previewUrl ?? ''}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={clsx(
            'h-full w-full object-cover transition-opacity duration-300 ease-(--ease-out-soft)',
            loaded ? 'opacity-100' : 'opacity-0',
          )}
        />
      ) : (
        <div className="texture-grain absolute inset-0 flex flex-col items-center justify-center gap-2 px-3">
          {bookmark.faviconUrl ? (
            <img
              src={bookmark.faviconUrl}
              alt=""
              loading="lazy"
              className={clsx('object-contain opacity-90', compact ? 'h-6 w-6' : 'h-9 w-9')}
            />
          ) : (
            <span
              aria-hidden
              className={clsx(
                'font-display font-semibold tracking-tight text-ink/85',
                compact ? 'text-base' : 'text-2xl',
              )}
            >
              {initialsFor(bookmark.domain || bookmark.siteName || '?')}
            </span>
          )}
          {/* Naming the site turns an empty block into something readable. */}
          {!compact ? (
            <span className="max-w-full truncate font-mono text-[0.6875rem] text-ink/55">
              {bookmark.domain || bookmark.siteName}
            </span>
          ) : null}
        </div>
      )}

      {isWorking ? (
        <div className="absolute inset-0 grid place-items-center bg-canvas/55">
          <Loader2 size={compact ? 16 : 20} className="animate-spin text-ink-muted" aria-hidden />
          <span className="sr-only">Fetching this page's details</span>
        </div>
      ) : null}
    </div>
  );
}

/** The small square icon used beside a title, with a letter as the last resort. */
export function Favicon({ bookmark, size = 16 }: { bookmark: Bookmark; size?: number }) {
  const [failed, setFailed] = useState(false);

  if (!bookmark.faviconUrl || failed) {
    return (
      <span
        aria-hidden
        className="grid shrink-0 place-items-center rounded-[0.25rem] bg-hover font-mono text-[0.5625rem] font-medium text-ink-muted"
        style={{ width: size, height: size }}
      >
        {(bookmark.domain || '?').charAt(0).toUpperCase()}
      </span>
    );
  }

  return (
    <img
      src={bookmark.faviconUrl}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className="shrink-0 rounded-[0.25rem] object-contain"
      style={{ width: size, height: size }}
    />
  );
}
