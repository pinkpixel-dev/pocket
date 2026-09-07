import type { AiSettings, Bookmark, Collection, ImportSummary, SortKey, Stats, Tag } from './types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly payload?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** True when the server refused a save because the link is already stored. */
  get duplicateBookmark(): Bookmark | null {
    const payload = this.payload as { duplicate?: boolean; bookmark?: Bookmark } | undefined;
    return payload?.duplicate && payload.bookmark ? payload.bookmark : null;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers:
        init?.body instanceof FormData
          ? init.headers
          : { 'content-type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiError(0, 'Pocket could not reach the server. Check that it is running.');
  }

  if (response.status === 204) return undefined as T;

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload !== null && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : `The server answered with ${response.status}.`;
    throw new ApiError(response.status, message, payload);
  }
  return payload as T;
}

export interface BookmarkFilters {
  q?: string;
  collection?: number | 'none';
  tag?: string | 'none';
  pinned?: boolean;
  sort?: SortKey;
}

export const api = {
  listBookmarks(filters: BookmarkFilters): Promise<{ items: Bookmark[]; total: number }> {
    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if (filters.collection !== undefined) params.set('collection', String(filters.collection));
    if (filters.tag !== undefined) params.set('tag', String(filters.tag));
    if (filters.pinned) params.set('pinned', '1');
    if (filters.sort) params.set('sort', filters.sort);
    const query = params.toString();
    return call(`/api/bookmarks${query ? `?${query}` : ''}`);
  },

  createBookmark(input: {
    url: string;
    title?: string;
    description?: string;
    collectionId?: number | null;
    tags?: string[];
    isPinned?: boolean;
  }): Promise<{ bookmark: Bookmark }> {
    return call('/api/bookmarks', { method: 'POST', body: JSON.stringify(input) });
  },

  updateBookmark(
    id: number,
    input: Partial<{
      url: string;
      title: string;
      description: string;
      collectionId: number | null;
      tags: string[];
      isPinned: boolean;
    }>,
  ): Promise<{ bookmark: Bookmark }> {
    return call(`/api/bookmarks/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
  },

  deleteBookmark(id: number): Promise<void> {
    return call(`/api/bookmarks/${id}`, { method: 'DELETE' });
  },

  setPinned(id: number, isPinned: boolean): Promise<{ bookmark: Bookmark }> {
    return call(`/api/bookmarks/${id}/pin`, { method: 'POST', body: JSON.stringify({ isPinned }) });
  },

  refreshBookmark(id: number): Promise<{ bookmark: Bookmark }> {
    return call(`/api/bookmarks/${id}/refresh`, { method: 'POST' });
  },

  /** Queues the AI pass. The returned bookmark is already marked pending. */
  fillWithAi(id: number): Promise<{ bookmark: Bookmark }> {
    return call(`/api/bookmarks/${id}/ai`, { method: 'POST' });
  },

  settings(): Promise<{ ai: AiSettings }> {
    return call('/api/settings');
  },

  updateAiSettings(input: {
    apiKey?: string;
    model?: string;
    reasoningEffort?: string;
    autoRun?: boolean;
    createCollections?: boolean;
  }): Promise<{ ai: AiSettings }> {
    return call('/api/settings/ai', { method: 'PATCH', body: JSON.stringify(input) });
  },

  listCollections(): Promise<{ collections: Collection[] }> {
    return call('/api/collections');
  },

  createCollection(input: { name: string; description?: string | null; color?: string | null }): Promise<{
    collection: Collection;
  }> {
    return call('/api/collections', { method: 'POST', body: JSON.stringify(input) });
  },

  updateCollection(
    id: number,
    input: { name?: string; description?: string | null; color?: string | null },
  ): Promise<{ collection: Collection }> {
    return call(`/api/collections/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
  },

  deleteCollection(id: number): Promise<void> {
    return call(`/api/collections/${id}`, { method: 'DELETE' });
  },

  listTags(): Promise<{ tags: Tag[] }> {
    return call('/api/tags');
  },

  renameTag(id: number, name: string): Promise<{ tag: Tag }> {
    return call(`/api/tags/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
  },

  deleteTag(id: number): Promise<void> {
    return call(`/api/tags/${id}`, { method: 'DELETE' });
  },

  stats(): Promise<Stats> {
    return call('/api/stats');
  },

  importFile(file: File, fetchMetadata: boolean): Promise<{ summary: ImportSummary }> {
    const form = new FormData();
    form.append('file', file);
    form.append('fetchMetadata', String(fetchMetadata));
    return call('/api/import', { method: 'POST', body: form });
  },
};
