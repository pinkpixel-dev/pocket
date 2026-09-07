import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, type BookmarkFilters } from '../lib/api';
import { parseRoute, type Route } from '../lib/route';
import type { AiSettings, Bookmark, CardSize, Collection, SortKey, Stats, Tag, ViewMode, AccentColor } from '../lib/types';
import { applyAccent, normalizeAccentId, ACCENT_STORAGE_KEY } from '../lib/theme';

const STORAGE_KEYS = {
  view: 'pocket:view',
  sort: 'pocket:sort',
  cardSize: 'pocket:card-size',
  accent: ACCENT_STORAGE_KEY,
} as const;

/** Bookmarks fetched per request. The server caps a single page at 500. */
const PAGE_SIZE = 100;
const MAX_PAGE = 500;

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
    case 'attention':
      return { ...base, status: 'failed' };
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
  /** Null until the first load. `configured` false hides every AI control. */
  aiSettings: AiSettings | null;
  setAiSettings: (settings: AiSettings) => void;
  loading: boolean;
  /** True while an extra page is being appended to the list. */
  loadingMore: boolean;
  /** False once every bookmark matching the current filters is loaded. */
  hasMore: boolean;
  loadMore: () => void;
  loadError: string | null;
  search: string;
  setSearch: (value: string) => void;
  sort: SortKey;
  setSort: (value: SortKey) => void;
  view: ViewMode;
  setView: (value: ViewMode) => void;
  cardSize: CardSize;
  setCardSize: (value: CardSize) => void;
  accentColor: AccentColor;
  setAccentColor: (value: AccentColor) => void;
  reload: () => Promise<void>;
  reloadSidebar: () => Promise<void>;
  applyBookmark: (bookmark: Bookmark) => void;
  removeBookmark: (id: number) => void;
  removeBookmarks: (ids: readonly number[]) => void;
  /** Every id matching the current filters, including pages not loaded yet. */
  collectAllIds: () => Promise<number[]>;
}

export function useLibrary(): Library {
  const route = useRoute();

  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [total, setTotal] = useState(0);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [aiSettings, setAiSettings] = useState<AiSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sort, setSortState] = useState<SortKey>(() =>
    readStored(STORAGE_KEYS.sort, ['newest', 'oldest', 'title', 'domain', 'updated'] as const, 'newest'),
  );
  const [view, setViewState] = useState<ViewMode>(() =>
    readStored(STORAGE_KEYS.view, ['grid', 'list'] as const, 'grid'),
  );
  const [cardSize, setCardSizeState] = useState<CardSize>(() =>
    readStored(STORAGE_KEYS.cardSize, ['small', 'medium', 'large'] as const, 'medium'),
  );
  const [accentColor, setAccentColorState] = useState<AccentColor>(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEYS.accent);
      return normalizeAccentId(stored);
    } catch {
      return 'gold';
    }
  });

  const requestId = useRef(0);
  // Reads inside callbacks that must stay stable across renders.
  const bookmarksRef = useRef<Bookmark[]>([]);
  const totalRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const filtersRef = useRef<BookmarkFilters | null>(null);

  useEffect(() => {
    bookmarksRef.current = bookmarks;
  }, [bookmarks]);

  useEffect(() => {
    totalRef.current = total;
  }, [total]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const filters = useMemo(
    () => filtersForRoute(route, debouncedSearch, sort),
    [route, debouncedSearch, sort],
  );

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  const loadBookmarks = useCallback(
    async (showSpinner: boolean) => {
      const id = ++requestId.current;
      if (showSpinner) setLoading(true);

      // A refresh keeps everything already scrolled into view, so it asks for
      // as much of the head of the list as one request is allowed to return.
      const loaded = showSpinner ? 0 : bookmarksRef.current.length;
      const limit = Math.min(Math.max(loaded, PAGE_SIZE), MAX_PAGE);

      try {
        const page = await api.listBookmarks(filters, { limit });
        // A slower earlier request must not overwrite a newer result.
        if (id !== requestId.current) return;
        setBookmarks((current) => {
          if (showSpinner) return page.items;
          const refreshed = new Set(page.items.map((item) => item.id));
          const tail = current.slice(page.items.length).filter((item) => !refreshed.has(item.id));
          return [...page.items, ...tail];
        });
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

  /** Appends the next page. Safe to call repeatedly; extra calls are ignored. */
  const loadMore = useCallback(() => {
    const offset = bookmarksRef.current.length;
    if (loadingMoreRef.current || offset === 0 || offset >= totalRef.current) return;

    loadingMoreRef.current = true;
    setLoadingMore(true);

    api
      .listBookmarks(filters, { limit: PAGE_SIZE, offset })
      .then((page) => {
        // The filters changed while this was in flight, so the page is stale.
        if (filtersRef.current !== filters) return;
        setBookmarks((current) => {
          const seen = new Set(current.map((item) => item.id));
          return [...current, ...page.items.filter((item) => !seen.has(item.id))];
        });
        setTotal(page.total);
      })
      .catch(() => {
        // Scrolling past the sentinel again retries; the loaded list stays put.
      })
      .finally(() => {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      });
  }, [filters]);

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

  // Settings change rarely, and the panel hands back the new copy itself.
  useEffect(() => {
    api
      .settings()
      .then((result) => setAiSettings(result.ai))
      .catch(() => setAiSettings(null));
  }, []);

  // Metadata and the AI pass both land after the save, so poll while either works.
  const hasPending = bookmarks.some(
    (bookmark) => bookmark.metadataStatus === 'pending' || bookmark.aiStatus === 'pending',
  );
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

  const setCardSize = useCallback((value: CardSize) => {
    setCardSizeState(value);
    writeStored(STORAGE_KEYS.cardSize, value);
  }, []);

  const setAccentColor = useCallback((value: AccentColor) => {
    const normalized = normalizeAccentId(value);
    setAccentColorState(normalized);
    writeStored(STORAGE_KEYS.accent, normalized);
    applyAccent(normalized);
  }, []);

  useEffect(() => {
    applyAccent(accentColor);
  }, [accentColor]);

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

  const removeBookmarks = useCallback(
    (ids: readonly number[]) => {
      const gone = new Set(ids);
      setBookmarks((current) => current.filter((item) => !gone.has(item.id)));
      setTotal((current) => Math.max(0, current - gone.size));
      void reloadSidebar();
    },
    [reloadSidebar],
  );

  /**
   * Selecting everything has to cover the whole filtered set, not just the
   * pages already on screen, so this walks the list server side and keeps only
   * the ids.
   */
  const collectAllIds = useCallback(async (): Promise<number[]> => {
    const ids: number[] = [];
    let offset = 0;

    for (;;) {
      const page = await api.listBookmarks(filters, { limit: MAX_PAGE, offset });
      ids.push(...page.items.map((item) => item.id));
      offset += page.items.length;
      if (page.items.length === 0 || offset >= page.total) break;
    }

    return ids;
  }, [filters]);

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
    aiSettings,
    setAiSettings,
    loading,
    loadingMore,
    hasMore: bookmarks.length < total,
    loadMore,
    loadError,
    search,
    setSearch,
    sort,
    setSort,
    view,
    setView,
    cardSize,
    setCardSize,
    accentColor,
    setAccentColor,
    reload,
    reloadSidebar,
    applyBookmark,
    removeBookmark,
    removeBookmarks,
    collectAllIds,
  };
}
