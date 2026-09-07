import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, type BookmarkFilters } from '../lib/api';
import { parseRoute, type Route } from '../lib/route';
import type { Bookmark, Collection, SortKey, Stats, Tag, ViewMode } from '../lib/types';

const STORAGE_KEYS = { view: 'pocket:view', sort: 'pocket:sort' } as const;

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // A private window with storage disabled just loses the preference.
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));

  useEffect(() => {
    const update = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);

  return route;
}

function filtersForRoute(route: Route, search: string, sort: SortKey): BookmarkFilters {
  const base: BookmarkFilters = { sort };
  if (search.trim()) base.q = search.trim();

  switch (route.kind) {
    case 'pinned':
      return { ...base, pinned: true };
    case 'collection':
      return { ...base, collection: route.id };
    case 'uncollected':
      return { ...base, collection: 'none' };
    case 'tag':
      return { ...base, tag: route.name };
    case 'untagged':
      return { ...base, tag: 'none' };
    default:
      return base;
  }
}

export interface Library {
  route: Route;
  bookmarks: Bookmark[];
  total: number;
  collections: Collection[];
  tags: Tag[];
  stats: Stats | null;
  loading: boolean;
  loadError: string | null;
  search: string;
  setSearch: (value: string) => void;
  sort: SortKey;
  setSort: (value: SortKey) => void;
  view: ViewMode;
  setView: (value: ViewMode) => void;
  reload: () => Promise<void>;
  reloadSidebar: () => Promise<void>;
  applyBookmark: (bookmark: Bookmark) => void;
  removeBookmark: (id: number) => void;
}

export function useLibrary(): Library {
  const route = useRoute();

  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [total, setTotal] = useState(0);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sort, setSortState] = useState<SortKey>(() =>
    readStored(STORAGE_KEYS.sort, ['newest', 'oldest', 'title', 'domain', 'updated'] as const, 'newest'),
  );
  const [view, setViewState] = useState<ViewMode>(() =>
    readStored(STORAGE_KEYS.view, ['grid', 'list'] as const, 'grid'),
  );

  const requestId = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const filters = useMemo(
    () => filtersForRoute(route, debouncedSearch, sort),
    [route, debouncedSearch, sort],
  );

  const loadBookmarks = useCallback(
    async (showSpinner: boolean) => {
      const id = ++requestId.current;
      if (showSpinner) setLoading(true);

      try {
        const page = await api.listBookmarks(filters);
        // A slower earlier request must not overwrite a newer result.
        if (id !== requestId.current) return;
        setBookmarks(page.items);
        setTotal(page.total);
        setLoadError(null);
      } catch (error) {
        if (id !== requestId.current) return;
        setLoadError(error instanceof ApiError ? error.message : 'The library could not be loaded.');
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [filters],
  );

  const reloadSidebar = useCallback(async () => {
    try {
      const [collectionsResult, tagsResult, statsResult] = await Promise.all([
        api.listCollections(),
        api.listTags(),
        api.stats(),
      ]);
      setCollections(collectionsResult.collections);
      setTags(tagsResult.tags);
      setStats(statsResult);
    } catch {
      // The sidebar is secondary; a failure here should not blank the library.
    }
  }, []);

  useEffect(() => {
    void loadBookmarks(true);
  }, [loadBookmarks]);

  useEffect(() => {
    void reloadSidebar();
  }, [reloadSidebar]);

  // Metadata arrives after the save, so poll while anything is still working.
  const hasPending = bookmarks.some((bookmark) => bookmark.metadataStatus === 'pending');
  useEffect(() => {
    if (!hasPending) return;
    const timer = window.setInterval(() => void loadBookmarks(false), 2500);
    return () => window.clearInterval(timer);
  }, [hasPending, loadBookmarks]);

  const setSort = useCallback((value: SortKey) => {
    setSortState(value);
    writeStored(STORAGE_KEYS.sort, value);
  }, []);

  const setView = useCallback((value: ViewMode) => {
    setViewState(value);
    writeStored(STORAGE_KEYS.view, value);
  }, []);

  /** Swaps one card in place so an edit does not reshuffle the whole grid. */
  const applyBookmark = useCallback(
    (bookmark: Bookmark) => {
      setBookmarks((current) => {
        const index = current.findIndex((item) => item.id === bookmark.id);
        if (index === -1) return current;
        const next = [...current];
        next[index] = bookmark;
        return next;
      });
      void reloadSidebar();
    },
    [reloadSidebar],
  );

  const removeBookmark = useCallback(
    (id: number) => {
      setBookmarks((current) => current.filter((item) => item.id !== id));
      setTotal((current) => Math.max(0, current - 1));
      void reloadSidebar();
    },
    [reloadSidebar],
  );

  const reload = useCallback(async () => {
    await Promise.all([loadBookmarks(false), reloadSidebar()]);
  }, [loadBookmarks, reloadSidebar]);

  return {
    route,
    bookmarks,
    total,
    collections,
    tags,
    stats,
    loading,
    loadError,
    search,
    setSearch,
    sort,
    setSort,
    view,
    setView,
    reload,
    reloadSidebar,
    applyBookmark,
    removeBookmark,
  };
}
