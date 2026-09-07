import clsx from 'clsx';
import {
  AlertTriangle,
  ExternalLink,
  FolderInput,
  ImageUp,
  MoreVertical,
  Pencil,
  Pin,
  PinOff,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Menu } from './ui/Menu';
import { Favicon, Preview } from './Preview';
import { displayUrl, relativeTime } from '../lib/format';
import type { Bookmark, CardSize, Collection } from '../lib/types';

export interface BookmarkActions {
  onEdit: (bookmark: Bookmark) => void;
  /** Opens the same edit dialog, with the cover controls in view. */
  onChangeCover: (bookmark: Bookmark) => void;
  onMove: (bookmark: Bookmark) => void;
  onTogglePin: (bookmark: Bookmark) => void;
  onRefresh: (bookmark: Bookmark) => void;
  onDelete: (bookmark: Bookmark) => void;
  /** Undefined when no OpenAI key is set, which removes the menu item. */
  onFillWithAi?: (bookmark: Bookmark) => void;
}

interface CardProps extends BookmarkActions {
  bookmark: Bookmark;
  collection: Collection | undefined;
  size: CardSize;
  busy?: boolean;
}

/**
 * Cards shrink by dropping detail, not by squashing text. Small keeps the
 * title, site and date; medium trims the description to a line; large is the
 * full card.
 */
const SIZE_STYLES = {
  small: {
    preview: 'aspect-16/9',
    body: 'gap-1.5 p-2.5',
    title: 'truncate text-[0.8125rem]',
    meta: 'text-[0.625rem]',
    trigger: 'h-8 w-8',
    controls: 'top-2 right-2 gap-1',
    icon: 14,
    description: false,
    tags: 0,
  },
  medium: {
    preview: 'aspect-16/10',
    body: 'gap-1.5 p-3',
    title: 'clamp-2 text-[0.875rem]',
    meta: 'text-[0.6875rem]',
    trigger: 'h-9 w-9',
    controls: 'top-2 right-2 gap-1.5',
    icon: 15,
    description: 'truncate',
    tags: 2,
  },
  large: {
    preview: 'aspect-16/10',
    body: 'gap-2 p-3.5',
    title: 'clamp-2 text-[0.9375rem]',
    meta: 'text-[0.6875rem]',
    trigger: 'h-9 w-9',
    controls: 'top-2.5 right-2.5 gap-1.5',
    icon: 16,
    description: 'clamp-2',
    tags: 3,
  },
} as const;

/** True once there is nothing left for the AI pass to write into. */
export function isFullyFilled(bookmark: Bookmark): boolean {
  return Boolean(
    bookmark.title && bookmark.description && bookmark.collectionId !== null && bookmark.tags.length > 0,
  );
}

export function buildMenuItems(bookmark: Bookmark, actions: BookmarkActions) {
  const filling = bookmark.aiStatus === 'pending';

  return [
    { label: 'Edit details', icon: <Pencil size={15} />, onSelect: () => actions.onEdit(bookmark) },
    {
      label: bookmark.coverUrl ? 'Change cover' : 'Add a cover',
      icon: <ImageUp size={15} />,
      onSelect: () => actions.onChangeCover(bookmark),
    },
    ...(actions.onFillWithAi
      ? [
          {
            label: filling ? 'Filling in…' : isFullyFilled(bookmark) ? 'Nothing left to fill in' : 'Fill in with AI',
            icon: <Sparkles size={15} />,
            disabled: filling || isFullyFilled(bookmark),
            onSelect: () => actions.onFillWithAi?.(bookmark),
          },
        ]
      : []),
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
  'grid place-items-center rounded-lg border border-line bg-canvas/85 text-ink-muted ' +
  'backdrop-blur-sm transition-colors hover:bg-hover hover:text-ink';

export function BookmarkCard({ bookmark, collection, size, busy, ...actions }: CardProps) {
  const title = bookmark.title || displayUrl(bookmark.url, 60);
  // A cover the user chose answers the complaint, so the flag stops being useful.
  const failed = bookmark.metadataStatus === 'failed' && !bookmark.coverUrl;
  const style = SIZE_STYLES[size];
  const triggerClass = clsx(TRIGGER_CLASS, style.trigger);

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
        <Preview bookmark={bookmark} className={clsx(style.preview, 'w-full')} />
        <span className="sr-only">Open {title} in a new tab</span>
      </a>

      {/* Controls sit above the link target so opening a card is never ambiguous. */}
      <div className={clsx('absolute flex items-center', style.controls)}>
        {bookmark.isPinned ? (
          <span className={clsx(triggerClass, 'text-accent')} title="Pinned">
            <Pin size={style.icon - 1} aria-hidden />
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
              className={triggerClass}
            >
              <MoreVertical size={style.icon} aria-hidden />
            </button>
          )}
        />
      </div>

      <div className={clsx('flex min-w-0 flex-1 flex-col', style.body)}>
        <div className="flex min-w-0 items-start gap-2">
          <span className="mt-0.5">
            <Favicon bookmark={bookmark} />
          </span>
          <h3 className={clsx('min-w-0 flex-1 leading-snug font-semibold text-ink', style.title)}>
            <a href={bookmark.url} target="_blank" rel="noreferrer noopener" className="hover:text-accent">
              {title}
            </a>
          </h3>
        </div>

        {style.description && bookmark.description ? (
          <p className={clsx('text-[0.8125rem] text-ink-muted', style.description)}>{bookmark.description}</p>
        ) : null}

        <div
          className={clsx(
            'mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 font-mono text-ink-faint',
            style.meta,
          )}
        >
          <span className="truncate" title={bookmark.url}>
            {bookmark.domain || displayUrl(bookmark.url, 28)}
          </span>
          <span aria-hidden>·</span>
          <time dateTime={bookmark.createdAt}>{relativeTime(bookmark.createdAt)}</time>
          {failed ? (
            <span className="inline-flex items-center gap-1 text-danger" title={bookmark.metadataError ?? 'Link could not be reached'}>
              <AlertTriangle size={11} aria-hidden />
              broken link
            </span>
          ) : null}
          {bookmark.aiStatus === 'pending' ? (
            <span className="inline-flex items-center gap-1 text-accent">
              <Sparkles size={11} className="animate-pulse" aria-hidden />
              filling in
            </span>
          ) : bookmark.aiStatus === 'failed' ? (
            <span className="inline-flex items-center gap-1 text-danger" title={bookmark.aiError ?? ''}>
              <AlertTriangle size={11} aria-hidden />
              AI failed
            </span>
          ) : null}
        </div>

        {style.tags > 0 && (collection || bookmark.tags.length > 0) ? (
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

            {bookmark.tags.slice(0, style.tags).map((tag) => (
              <a
                key={tag}
                href={`#/tags/${encodeURIComponent(tag)}`}
                className="max-w-full truncate rounded-md px-1.5 py-1 font-mono text-[0.6875rem] text-ink-faint transition-colors hover:bg-raised hover:text-ink"
              >
                #{tag}
              </a>
            ))}
            {bookmark.tags.length > style.tags ? (
              <span className="font-mono text-[0.6875rem] text-ink-faint">
                +{bookmark.tags.length - style.tags}
              </span>
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
