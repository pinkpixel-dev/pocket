import { useEffect, useRef, type ReactNode } from 'react';
import clsx from 'clsx';
import { CheckSquare, LayoutGrid, List, Menu as MenuIcon, Plus, Search, X } from 'lucide-react';
import { Button } from './ui/Button';
import type { SortKey, ViewMode } from '../lib/types';

interface TopBarProps {
  title: string;
  subtitle: string;
  search: string;
  onSearchChange: (value: string) => void;
  sort: SortKey;
  onSortChange: (value: SortKey) => void;
  view: ViewMode;
  onViewChange: (value: ViewMode) => void;
  onOpenNav: () => void;
  onAdd: () => void;
  showControls: boolean;
  /** Hidden when the view has nothing to select. */
  canSelect: boolean;
  onStartSelecting: () => void;
  /** Rendered inside the sticky header, under the controls. */
  banner?: ReactNode;
}

const SORT_LABELS: Array<{ value: SortKey; label: string }> = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'title', label: 'Title A–Z' },
  { value: 'domain', label: 'Site A–Z' },
  { value: 'updated', label: 'Recently changed' },
];

export function TopBar({
  title,
  subtitle,
  search,
  onSearchChange,
  sort,
  onSortChange,
  view,
  onViewChange,
  onOpenNav,
  onAdd,
  showControls,
  canSelect,
  onStartSelecting,
  banner,
}: TopBarProps) {
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" focuses search the way it does in most link-heavy apps.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;

      if (event.key === '/' && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-canvas/92 backdrop-blur-md">
      <div className="flex items-center gap-2 px-3 py-3 sm:px-6 lg:py-4">
        <button
          type="button"
          onClick={onOpenNav}
          aria-label="Open navigation"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface hover:text-ink lg:hidden"
        >
          <MenuIcon size={20} aria-hidden />
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl leading-tight text-ink sm:text-2xl">{title}</h1>
          <p className="truncate text-[0.8125rem] text-ink-faint">{subtitle}</p>
        </div>

        <Button variant="primary" onClick={onAdd} className="shrink-0">
          <Plus size={17} strokeWidth={2.5} aria-hidden />
          <span className="hidden sm:inline">New link</span>
          <span className="sr-only sm:hidden">New link</span>
        </Button>
      </div>

      {showControls ? (
        <div className="flex flex-wrap items-center gap-2 px-3 pb-3 sm:flex-nowrap sm:px-6">
          {/* On a narrow screen the search field owns its own row. */}
          <div className="relative order-1 w-full min-w-0 sm:order-none sm:flex-1">
            <Search
              size={16}
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint"
            />
            <input
              ref={searchRef}
              type="search"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') onSearchChange('');
              }}
              placeholder="Search titles, links, tags…"
              aria-label="Search bookmarks"
              className="h-11 w-full rounded-lg border border-line bg-surface pr-9 pl-9 text-[0.9375rem] text-ink placeholder:text-ink-faint transition-colors hover:border-line-strong focus:border-accent focus:outline-none [&::-webkit-search-cancel-button]:hidden"
            />
            {search ? (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                aria-label="Clear search"
                className="absolute top-1/2 right-1.5 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-ink-faint transition-colors hover:bg-hover hover:text-ink"
              >
                <X size={15} aria-hidden />
              </button>
            ) : null}
          </div>

          <label className="sr-only" htmlFor="sort-select">
            Sort bookmarks
          </label>
          <select
            id="sort-select"
            value={sort}
            onChange={(event) => onSortChange(event.target.value as SortKey)}
            className="order-2 h-11 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 text-[0.8125rem] text-ink-muted transition-colors hover:border-line-strong hover:text-ink focus:border-accent focus:outline-none sm:order-none sm:flex-none sm:shrink-0 sm:px-3"
          >
            {SORT_LABELS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {canSelect ? (
            <button
              type="button"
              onClick={onStartSelecting}
              title="Select bookmarks"
              className="order-4 grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-line bg-surface text-ink-muted transition-colors hover:border-line-strong hover:text-ink focus:border-accent focus:outline-none sm:order-none"
            >
              <CheckSquare size={16} aria-hidden />
              <span className="sr-only">Select bookmarks</span>
            </button>
          ) : null}

          <div
            role="group"
            aria-label="Layout"
            className="order-3 flex h-11 shrink-0 items-center gap-0.5 rounded-lg border border-line bg-surface p-1 sm:order-none"
          >
            {(
              [
                { value: 'grid' as const, icon: <LayoutGrid size={16} aria-hidden />, label: 'Grid view' },
                { value: 'list' as const, icon: <List size={16} aria-hidden />, label: 'List view' },
              ]
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onViewChange(option.value)}
                aria-pressed={view === option.value}
                aria-label={option.label}
                title={option.label}
                className={clsx(
                  'grid h-full w-9 place-items-center rounded-md transition-colors duration-150',
                  view === option.value
                    ? 'bg-raised text-ink'
                    : 'text-ink-faint hover:bg-hover hover:text-ink-muted',
                )}
              >
                {option.icon}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {banner}
    </header>
  );
}
