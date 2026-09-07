import clsx from 'clsx';
import { BookmarkCard, type BookmarkActions } from './BookmarkCard';
import { BookmarkRow } from './BookmarkRow';
import type { Bookmark, Collection, ViewMode } from '../lib/types';

interface BookmarkGridProps extends BookmarkActions {
  bookmarks: Bookmark[];
  collections: Collection[];
  view: ViewMode;
  busyIds: ReadonlySet<number>;
}

const GRID_CLASS =
  'grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 3xl:grid-cols-5';

export function BookmarkGrid({ bookmarks, collections, view, busyIds, ...actions }: BookmarkGridProps) {
  const byId = new Map(collections.map((collection) => [collection.id, collection]));

  if (view === 'list') {
    return (
      <div className="flex flex-col gap-0.5">
        {bookmarks.map((bookmark) => (
          <BookmarkRow
            key={bookmark.id}
            bookmark={bookmark}
            collection={bookmark.collectionId ? byId.get(bookmark.collectionId) : undefined}
            busy={busyIds.has(bookmark.id)}
            {...actions}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={GRID_CLASS}>
      {bookmarks.map((bookmark) => (
        <BookmarkCard
          key={bookmark.id}
          bookmark={bookmark}
          collection={bookmark.collectionId ? byId.get(bookmark.collectionId) : undefined}
          busy={busyIds.has(bookmark.id)}
          {...actions}
        />
      ))}
    </div>
  );
}

/** Placeholders sized like the real cards, so the layout does not jump. */
export function BookmarkSkeleton({ view }: { view: ViewMode }) {
  const items = Array.from({ length: view === 'grid' ? 8 : 6 }, (_, index) => index);

  if (view === 'list') {
    return (
      <div className="flex flex-col gap-0.5" aria-hidden>
        {items.map((index) => (
          <div key={index} className="flex items-center gap-3 px-2.5 py-2.5">
            <div className="h-11 w-11 shrink-0 animate-pulse rounded-lg bg-surface sm:h-12 sm:w-16" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="h-3.5 w-2/5 animate-pulse rounded bg-surface" />
              <div className="h-2.5 w-3/5 animate-pulse rounded bg-surface" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={clsx(GRID_CLASS)} aria-hidden>
      {items.map((index) => (
        <div key={index} className="overflow-hidden rounded-(--radius-card) border border-line bg-surface">
          <div className="aspect-16/10 w-full animate-pulse bg-raised" />
          <div className="flex flex-col gap-2 p-3.5">
            <div className="h-3.5 w-4/5 animate-pulse rounded bg-raised" />
            <div className="h-2.5 w-2/5 animate-pulse rounded bg-raised" />
          </div>
        </div>
      ))}
    </div>
  );
}
