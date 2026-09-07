import clsx from 'clsx';
import {
  AlertTriangle,
  ExternalLink,
  FolderInput,
  MoreVertical,
  Pencil,
  Pin,
  PinOff,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { Menu } from './ui/Menu';
import { Favicon, Preview } from './Preview';
import { displayUrl, relativeTime } from '../lib/format';
import type { Bookmark, Collection } from '../lib/types';

export interface BookmarkActions {
  onEdit: (bookmark: Bookmark) => void;
  onMove: (bookmark: Bookmark) => void;
  onTogglePin: (bookmark: Bookmark) => void;
  onRefresh: (bookmark: Bookmark) => void;
  onDelete: (bookmark: Bookmark) => void;
}

interface CardProps extends BookmarkActions {
  bookmark: Bookmark;
  collection: Collection | undefined;
  busy?: boolean;
}

export function buildMenuItems(bookmark: Bookmark, actions: BookmarkActions) {
  return [
    { label: 'Edit details', icon: <Pencil size={15} />, onSelect: () => actions.onEdit(bookmark) },
    { label: 'Move to collection', icon: <FolderInput size={15} />, onSelect: () => actions.onMove(bookmark) },
    {
      label: bookmark.isPinned ? 'Unpin' : 'Pin to top',
      icon: bookmark.isPinned ? <PinOff size={15} /> : <Pin size={15} />,
      onSelect: () => actions.onTogglePin(bookmark),
    },
    { label: 'Refresh preview', icon: <RefreshCw size={15} />, onSelect: () => actions.onRefresh(bookmark) },
    {
      label: 'Delete',
      icon: <Trash2 size={15} />,
      destructive: true,
      onSelect: () => actions.onDelete(bookmark),
    },
  ];
}

const TRIGGER_CLASS =
  'grid h-9 w-9 place-items-center rounded-lg border border-line bg-canvas/85 text-ink-muted ' +
  'backdrop-blur-sm transition-colors hover:bg-hover hover:text-ink';

export function BookmarkCard({ bookmark, collection, busy, ...actions }: CardProps) {
  const title = bookmark.title || displayUrl(bookmark.url, 60);
  const failed = bookmark.metadataStatus === 'failed';

  return (
    <article
      className={clsx(
        'group relative flex flex-col overflow-hidden rounded-(--radius-card) border border-line bg-surface',
        'transition-colors duration-200 ease-(--ease-out-soft) hover:border-line-strong',
        'focus-within:border-accent',
        busy && 'opacity-60',
      )}
    >
      <a
        href={bookmark.url}
        target="_blank"
        rel="noreferrer noopener"
        className="block focus-visible:outline-offset-[-2px]"
      >
        <Preview bookmark={bookmark} className="aspect-16/10 w-full" />
        <span className="sr-only">Open {title} in a new tab</span>
      </a>

      {/* Controls sit above the link target so opening a card is never ambiguous. */}
      <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
        {bookmark.isPinned ? (
          <span className={clsx(TRIGGER_CLASS, 'text-accent')} title="Pinned">
            <Pin size={15} aria-hidden />
            <span className="sr-only">Pinned</span>
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
              className={TRIGGER_CLASS}
            >
              <MoreVertical size={16} aria-hidden />
            </button>
          )}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2 p-3.5">
        <div className="flex min-w-0 items-start gap-2">
          <span className="mt-0.5">
            <Favicon bookmark={bookmark} />
          </span>
          <h3 className="clamp-2 min-w-0 flex-1 text-[0.9375rem] leading-snug font-semibold text-ink">
            <a href={bookmark.url} target="_blank" rel="noreferrer noopener" className="hover:text-accent">
              {title}
            </a>
          </h3>
        </div>

        {bookmark.description ? (
          <p className="clamp-2 text-[0.8125rem] text-ink-muted">{bookmark.description}</p>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 font-mono text-[0.6875rem] text-ink-faint">
          <span className="truncate" title={bookmark.url}>
            {bookmark.domain || displayUrl(bookmark.url, 28)}
          </span>
          <span aria-hidden>·</span>
          <time dateTime={bookmark.createdAt}>{relativeTime(bookmark.createdAt)}</time>
          {failed ? (
            <span className="inline-flex items-center gap-1 text-danger" title={bookmark.metadataError ?? ''}>
              <AlertTriangle size={11} aria-hidden />
              no preview
            </span>
          ) : null}
        </div>

        {collection || bookmark.tags.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {collection ? (
              <a
                href={`#/collections/${collection.id}`}
                className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-raised px-2 py-1 text-[0.6875rem] font-medium text-ink-muted transition-colors hover:bg-hover hover:text-ink"
              >
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: collection.color ?? 'var(--color-accent)' }}
                />
                <span className="truncate">{collection.name}</span>
              </a>
            ) : null}

            {bookmark.tags.slice(0, 3).map((tag) => (
              <a
                key={tag}
                href={`#/tags/${encodeURIComponent(tag)}`}
                className="max-w-full truncate rounded-md px-1.5 py-1 font-mono text-[0.6875rem] text-ink-faint transition-colors hover:bg-raised hover:text-ink"
              >
                #{tag}
              </a>
            ))}
            {bookmark.tags.length > 3 ? (
              <span className="font-mono text-[0.6875rem] text-ink-faint">+{bookmark.tags.length - 3}</span>
            ) : null}
          </div>
        ) : null}
      </div>

      <a
        href={bookmark.url}
        target="_blank"
        rel="noreferrer noopener"
        aria-hidden
        tabIndex={-1}
        className="pointer-events-none absolute right-3.5 bottom-3.5 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100"
      >
        <ExternalLink size={13} />
      </a>
    </article>
  );
}
