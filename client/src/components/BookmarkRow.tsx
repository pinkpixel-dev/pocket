import clsx from 'clsx';
import { AlertTriangle, MoreVertical, Pin } from 'lucide-react';
import { Menu } from './ui/Menu';
import { Preview } from './Preview';
import { buildMenuItems, type BookmarkActions } from './BookmarkCard';
import { displayUrl, relativeTime } from '../lib/format';
import type { Bookmark, Collection } from '../lib/types';

interface RowProps extends BookmarkActions {
  bookmark: Bookmark;
  collection: Collection | undefined;
  busy?: boolean;
}

/** The compact view, for scanning or tidying a lot of links at once. */
export function BookmarkRow({ bookmark, collection, busy, ...actions }: RowProps) {
  const title = bookmark.title || displayUrl(bookmark.url, 70);

  return (
    <article
      className={clsx(
        'group flex items-center gap-3 rounded-xl border border-transparent px-2.5 py-2.5',
        'transition-colors duration-150 hover:border-line hover:bg-surface focus-within:border-line',
        busy && 'opacity-60',
      )}
    >
      <Preview bookmark={bookmark} compact className="h-11 w-11 shrink-0 rounded-lg sm:h-12 sm:w-16" />

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          {bookmark.isPinned ? <Pin size={12} className="shrink-0 text-accent" aria-label="Pinned" /> : null}
          <h3 className="min-w-0 truncate text-[0.9375rem] font-semibold text-ink">
            <a href={bookmark.url} target="_blank" rel="noreferrer noopener" className="hover:text-accent">
              {title}
            </a>
          </h3>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-x-2 font-mono text-[0.6875rem] text-ink-faint">
          <span className="truncate">{displayUrl(bookmark.url, 46)}</span>
          <span aria-hidden className="hidden sm:inline">
            ·
          </span>
          <time dateTime={bookmark.createdAt} className="hidden sm:inline">
            {relativeTime(bookmark.createdAt)}
          </time>
          {bookmark.metadataStatus === 'failed' && !bookmark.coverUrl ? (
            <span
              className="inline-flex items-center gap-1 text-danger"
              title={bookmark.metadataError ?? 'Link could not be reached'}
            >
              <AlertTriangle size={11} aria-hidden />
              <span>broken link</span>
            </span>
          ) : null}
        </div>
      </div>

      {collection ? (
        <a
          href={`#/collections/${collection.id}`}
          className="hidden max-w-36 shrink-0 items-center gap-1.5 rounded-md bg-raised px-2 py-1 text-[0.6875rem] text-ink-muted transition-colors hover:bg-hover hover:text-ink lg:inline-flex"
        >
          <span
            aria-hidden
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: collection.color ?? 'var(--color-accent)' }}
          />
          <span className="truncate">{collection.name}</span>
        </a>
      ) : null}

      {bookmark.tags.length > 0 ? (
        <span className="hidden shrink-0 font-mono text-[0.6875rem] text-ink-faint xl:inline">
          #{bookmark.tags[0]}
          {bookmark.tags.length > 1 ? ` +${bookmark.tags.length - 1}` : ''}
        </span>
      ) : null}

      <Menu
        label={`Actions for ${title}`}
        items={buildMenuItems(bookmark, actions)}
        trigger={(triggerProps) => (
          <button
            type="button"
            {...triggerProps}
            aria-haspopup="menu"
            aria-label={`Actions for ${title}`}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-hover hover:text-ink"
          >
            <MoreVertical size={16} aria-hidden />
          </button>
        )}
      />
    </article>
  );
}
