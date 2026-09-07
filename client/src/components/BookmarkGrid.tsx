import clsx from 'clsx';
import { BookmarkCard, type BookmarkActions } from './BookmarkCard';
import { BookmarkRow } from './BookmarkRow';
import type { Bookmark, CardSize, Collection, ViewMode } from '../lib/types';

interface BookmarkGridProps extends BookmarkActions {
  bookmarks: Bookmark[];
  collections: Collection[];
  view: ViewMode;
  cardSize: CardSize;
  busyIds: ReadonlySet<number>;
}

/** Column counts per card size. Small still shows two across on a phone. */
const GRID_CLASS: Record<CardSize, string> = {
  small: 'grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6',
  medium: 'grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5',
  large: 'grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 3xl:grid-cols-5',
};

/** Enough placeholders to fill the first screen at each density. */
const SKELETON_COUNT: Record<CardSize, number> = { small: 18, medium: 12, large: 8 };

const SKELETON_PREVIEW: Record<CardSize, string> = {
  small: 'aspect-16/9',
  medium: 'aspect-16/10',
  large: 'aspect-16/10',
};

export function BookmarkGrid({
  bookmarks,
  collections,
  view,
  cardSize,
  busyIds,
  ...actions
}: BookmarkGridProps) {
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
    <div className={GRID_CLASS[cardSize]}>
      {bookmarks.map((bookmark) => (
        <BookmarkCard
          key={bookmark.id}
          bookmark={bookmark}
          collection={bookmark.collectionId ? byId.get(bookmark.collectionId) : undefined}
          size={cardSize}
          busy={busyIds.has(bookmark.id)}
          {...actions}
        />
      ))}
    </div>
  );
}

/** Placeholders sized like the real cards, so the layout does not jump. */
export function BookmarkSkeleton({ view, cardSize }: { view: ViewMode; cardSize: CardSize }) {
  const items = Array.from(
    { length: view === 'grid' ? SKELETON_COUNT[cardSize] : 6 },
    (_, index) => index,
  );

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
    <div className={GRID_CLASS[cardSize]} aria-hidden>
      {items.map((index) => (
        <div key={index} className="overflow-hidden rounded-(--radius-card) border border-line bg-surface">
          <div className={clsx('w-full animate-pulse bg-raised', SKELETON_PREVIEW[cardSize])} />
          <div className={clsx('flex flex-col gap-2', cardSize === 'large' ? 'p-3.5' : 'p-3')}>
            <div className="h-3.5 w-4/5 animate-pulse rounded bg-raised" />
            <div className="h-2.5 w-2/5 animate-pulse rounded bg-raised" />
          </div>
        </div>
      ))}
    </div>
  );
}
