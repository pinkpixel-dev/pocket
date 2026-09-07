import { useState, type ReactNode } from 'react';
import clsx from 'clsx';
import {
  Bookmark as BookmarkIcon,
  FolderOpen,
  Hash,
  Inbox,
  Library,
  MoreHorizontal,
  Pencil,
  Pin,
  Plus,
  Settings,
  TagIcon,
  Trash2,
  X,
} from 'lucide-react';
import { Menu } from './ui/Menu';
import { routeHref, routesMatch, type Route } from '../lib/route';
import type { Collection, Stats, Tag } from '../lib/types';

interface SidebarProps {
  route: Route;
  collections: Collection[];
  tags: Tag[];
  stats: Stats | null;
  open: boolean;
  onClose: () => void;
  onCreateCollection: () => void;
  onEditCollection: (collection: Collection) => void;
  onDeleteCollection: (collection: Collection) => void;
}

const TAGS_BEFORE_FOLD = 12;

interface NavLinkProps {
  target: Route;
  current: Route;
  icon: React.ReactNode;
  label: string;
  count?: number;
  swatch?: string | null;
  /** Sits beside the link, not inside it, so the row stays one anchor. */
  trailing?: ReactNode;
  onNavigate: () => void;
}

function NavLink({ target, current, icon, label, count, swatch, trailing, onNavigate }: NavLinkProps) {
  const active = routesMatch(target, current);

  return (
    <div className="relative flex items-center">
      <a
        href={routeHref(target)}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        className={clsx(
          'flex min-h-11 flex-1 items-center gap-2.5 rounded-lg px-2.5 text-[0.875rem] transition-colors duration-150',
          trailing && 'pr-10',
          active ? 'bg-raised font-semibold text-ink' : 'text-ink-muted hover:bg-surface hover:text-ink',
        )}
      >
        <span className={clsx('shrink-0', active ? 'text-accent' : 'text-ink-faint')}>
          {swatch !== undefined ? (
            <span
              aria-hidden
              className="block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: swatch ?? 'var(--color-line-strong)' }}
            />
          ) : (
            icon
          )}
        </span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {count !== undefined && count > 0 ? (
          <span className="shrink-0 font-mono text-[0.6875rem] text-ink-faint tabular-nums">{count}</span>
        ) : null}
      </a>
      {trailing ? <div className="absolute right-1">{trailing}</div> : null}
    </div>
  );
}

/**
 * Rename and delete also live in Settings, but a collection is something you
 * point at in the sidebar, so the menu belongs here too. It stays visible
 * rather than appearing on hover, which never happens on a phone.
 */
function CollectionMenu({
  collection,
  onEdit,
  onDelete,
}: {
  collection: Collection;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Menu
      label={`Actions for ${collection.name}`}
      items={[
        { label: 'Rename and recolour', icon: <Pencil size={15} />, onSelect: onEdit },
        { label: 'Delete collection', icon: <Trash2 size={15} />, destructive: true, onSelect: onDelete },
      ]}
      trigger={(triggerProps) => (
        <button
          type="button"
          {...triggerProps}
          aria-haspopup="menu"
          aria-label={`Actions for ${collection.name}`}
          className="grid h-9 w-9 place-items-center rounded-md text-ink-faint transition-colors hover:bg-hover hover:text-ink aria-expanded:bg-hover aria-expanded:text-ink"
        >
          <MoreHorizontal size={15} aria-hidden />
        </button>
      )}
    />
  );
}

function SectionHeading({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 px-2.5 pt-5 pb-1.5">
      <h2 className="font-sans text-[0.6875rem] font-bold tracking-wider text-ink-faint uppercase">
        {children}
      </h2>
      {action}
    </div>
  );
}

export function Sidebar({
  route,
  collections,
  tags,
  stats,
  open,
  onClose,
  onCreateCollection,
  onEditCollection,
  onDeleteCollection,
}: SidebarProps) {
  const [showAllTags, setShowAllTags] = useState(false);
  const visibleTags = showAllTags ? tags : tags.slice(0, TAGS_BEFORE_FOLD);

  return (
    <>
      {open ? (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
        />
      ) : null}

      <nav
        aria-label="Library"
        className={clsx(
          'fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-line bg-canvas',
          'transition-transform duration-200 ease-(--ease-out-soft)',
          'lg:sticky lg:top-0 lg:h-dvh lg:w-64 lg:translate-x-0 lg:transition-none',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between gap-2 px-4">
          <a href="#/" onClick={onClose} className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-ink">
              <BookmarkIcon size={17} strokeWidth={2.5} aria-hidden />
            </span>
            <span className="font-display text-lg font-semibold tracking-tight text-ink">Pocket</span>
          </a>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="grid h-10 w-10 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface hover:text-ink lg:hidden"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <div className="scroll-area min-h-0 flex-1 overflow-y-auto px-2.5 pb-4">
          <div className="flex flex-col gap-0.5">
            <NavLink
              target={{ kind: 'all' }}
              current={route}
              icon={<Library size={16} aria-hidden />}
              label="All bookmarks"
              count={stats?.total}
              onNavigate={onClose}
            />
            <NavLink
              target={{ kind: 'pinned' }}
              current={route}
              icon={<Pin size={16} aria-hidden />}
              label="Pinned"
              count={stats?.pinned}
              onNavigate={onClose}
            />
          </div>

          <SectionHeading
            action={
              <button
                type="button"
                onClick={onCreateCollection}
                aria-label="New collection"
                className="grid h-7 w-7 place-items-center rounded-md text-ink-faint transition-colors hover:bg-surface hover:text-ink"
              >
                <Plus size={15} aria-hidden />
              </button>
            }
          >
            Collections
          </SectionHeading>

          <div className="flex flex-col gap-0.5">
            {collections.length === 0 ? (
              <p className="px-2.5 py-1 text-[0.8125rem] text-ink-faint">
                Group related links into a collection.
              </p>
            ) : (
              collections.map((collection) => (
                <NavLink
                  key={collection.id}
                  target={{ kind: 'collection', id: collection.id }}
                  current={route}
                  icon={<FolderOpen size={16} aria-hidden />}
                  label={collection.name}
                  count={collection.bookmarkCount}
                  swatch={collection.color}
                  trailing={
                    <CollectionMenu
                      collection={collection}
                      onEdit={() => onEditCollection(collection)}
                      onDelete={() => onDeleteCollection(collection)}
                    />
                  }
                  onNavigate={onClose}
                />
              ))
            )}

            {stats && stats.uncollected > 0 && collections.length > 0 ? (
              <NavLink
                target={{ kind: 'uncollected' }}
                current={route}
                icon={<Inbox size={16} aria-hidden />}
                label="No collection"
                count={stats.uncollected}
                onNavigate={onClose}
              />
            ) : null}
          </div>

          <SectionHeading>Tags</SectionHeading>

          <div className="flex flex-col gap-0.5">
            {tags.length === 0 ? (
              <p className="px-2.5 py-1 text-[0.8125rem] text-ink-faint">
                Add tags when you save a link to filter by them here.
              </p>
            ) : (
              visibleTags.map((tag) => (
                <NavLink
                  key={tag.id}
                  target={{ kind: 'tag', name: tag.name }}
                  current={route}
                  icon={<Hash size={16} aria-hidden />}
                  label={tag.name}
                  count={tag.bookmarkCount}
                  onNavigate={onClose}
                />
              ))
            )}

            {tags.length > TAGS_BEFORE_FOLD ? (
              <button
                type="button"
                onClick={() => setShowAllTags((value) => !value)}
                className="mt-0.5 flex min-h-9 items-center gap-2.5 rounded-lg px-2.5 text-left text-[0.8125rem] text-ink-faint transition-colors hover:bg-surface hover:text-ink"
              >
                <TagIcon size={14} aria-hidden />
                {showAllTags ? 'Show fewer tags' : `Show all ${tags.length} tags`}
              </button>
            ) : null}

            {stats && stats.untagged > 0 && tags.length > 0 ? (
              <NavLink
                target={{ kind: 'untagged' }}
                current={route}
                icon={<Inbox size={16} aria-hidden />}
                label="Untagged"
                count={stats.untagged}
                onNavigate={onClose}
              />
            ) : null}
          </div>
        </div>

        <div className="shrink-0 border-t border-line px-2.5 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
          <NavLink
            target={{ kind: 'settings' }}
            current={route}
            icon={<Settings size={16} aria-hidden />}
            label="Settings"
            onNavigate={onClose}
          />
        </div>
      </nav>
    </>
  );
}
