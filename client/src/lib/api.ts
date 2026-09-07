import type {
  AiBatchResult,
  CleanupPlan,
  CollectionPlan,
  TagCleanupPlan,
  AiSettings,
  ApplyCategoryAssignment,
  AuditStatus,
  Bookmark,
  Collection,
  ImportFileOptions,
  ImportSummary,
  MetadataStatus,
  SessionState,
  SessionUser,
  SortKey,
  Stats,
  Tag,
  UncollectedDomainsResponse,
} from './types';

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

  /** True when the answer was "sign in first" rather than a real failure. */
  get needsSignIn(): boolean {
    return this.status === 401;
  }
}

/**
 * Called whenever the server answers 401, so a session that expired while a
 * tab sat open sends the app back to the sign-in screen instead of filling it
 * with error toasts.
 */
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      // The session lives in a cookie, which same-origin requests already send.
      // Saying so explicitly keeps it working if this ever moves behind a proxy.
      credentials: 'same-origin',
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
    // The sign-in and setup calls answer 401 for a wrong password, and that is
    // not a dead session, so they opt out of the redirect.
    if (response.status === 401 && !path.startsWith('/api/auth/')) onUnauthorized?.();

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
  status?: MetadataStatus;
  sort?: SortKey;
}

export const api = {
  /** Asked once at startup, and again after signing in or out. */
  session(): Promise<SessionState> {
    return call('/api/auth/session');
  },

  /** Claims the owner account on a fresh install. Fails once one exists. */
  setup(input: { username: string; password: string; displayName?: string }): Promise<{
    user: SessionUser;
  }> {
    return call('/api/auth/setup', { method: 'POST', body: JSON.stringify(input) });
  },

  login(input: { username: string; password: string }): Promise<{ user: SessionUser }> {
    return call('/api/auth/login', { method: 'POST', body: JSON.stringify(input) });
  },

  logout(): Promise<void> {
    return call('/api/auth/logout', { method: 'POST' });
  },

  updateProfile(displayName: string): Promise<{ user: SessionUser }> {
    return call('/api/auth/profile', { method: 'PATCH', body: JSON.stringify({ displayName }) });
  },

  /** Signs out every other device, which is the point of changing it. */
  changePassword(input: { currentPassword: string; newPassword: string }): Promise<{
    ok: boolean;
    signedOutElsewhere: number;
  }> {
    return call('/api/auth/password', { method: 'POST', body: JSON.stringify(input) });
  },

  listUsers(): Promise<{ users: SessionUser[] }> {
    return call('/api/users');
  },

  createUser(input: { username: string; password: string; displayName?: string }): Promise<{
    user: SessionUser;
  }> {
    return call('/api/users', { method: 'POST', body: JSON.stringify(input) });
  },

  resetUserPassword(id: number, newPassword: string): Promise<{ ok: boolean }> {
    return call(`/api/users/${id}/password`, {
      method: 'POST',
      body: JSON.stringify({ newPassword }),
    });
  },

  deleteUser(id: number): Promise<void> {
    return call(`/api/users/${id}`, { method: 'DELETE' });
  },

  listBookmarks(
    filters: BookmarkFilters,
    page?: { limit?: number; offset?: number },
  ): Promise<{ items: Bookmark[]; total: number }> {
    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if (filters.collection !== undefined) params.set('collection', String(filters.collection));
    if (filters.tag !== undefined) params.set('tag', String(filters.tag));
    if (filters.pinned) params.set('pinned', '1');
    if (filters.status) params.set('status', filters.status);
    if (filters.sort) params.set('sort', filters.sort);
    if (page?.limit !== undefined) params.set('limit', String(page.limit));
    if (page?.offset) params.set('offset', String(page.offset));
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

  /** Deletes many bookmarks at once. Ids that no longer exist are skipped. */
  bulkDeleteBookmarks(ids: number[]): Promise<{ deleted: number }> {
    return call('/api/bookmarks/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) });
  },

  setPinned(id: number, isPinned: boolean): Promise<{ bookmark: Bookmark }> {
    return call(`/api/bookmarks/${id}/pin`, { method: 'POST', body: JSON.stringify({ isPinned }) });
  },

  refreshBookmark(id: number): Promise<{ bookmark: Bookmark }> {
    return call(`/api/bookmarks/${id}/refresh`, { method: 'POST' });
  },

  /** Dismisses a broken link warning and restores status to ok or manual. */
  dismissBroken(id: number): Promise<{ bookmark: Bookmark }> {
    return call(`/api/bookmarks/${id}/dismiss-broken`, { method: 'POST' });
  },

  /** Dismisses broken link warnings on multiple bookmarks in bulk. */
  dismissBrokenBulk(ids: number[]): Promise<{ count: number }> {
    return call('/api/bookmarks/bulk-dismiss-broken', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
  },

  /** Probes a single bookmark's link on demand and updates its status. */
  checkBookmarkLink(id: number): Promise<{ bookmark: Bookmark }> {
    return call(`/api/bookmarks/${id}/check`, { method: 'POST' });
  },

  /** Uploads a cover. The server sniffs the bytes, so the file type is checked there. */
  uploadCover(id: number, file: File): Promise<{ bookmark: Bookmark }> {
    const form = new FormData();
    form.append('file', file);
    return call(`/api/bookmarks/${id}/cover`, { method: 'POST', body: form });
  },

  /** Pocket downloads the image itself, through the same guarded client. */
  setCoverFromUrl(id: number, imageUrl: string): Promise<{ bookmark: Bookmark }> {
    return call(`/api/bookmarks/${id}/cover`, { method: 'POST', body: JSON.stringify({ imageUrl }) });
  },

  removeCover(id: number): Promise<{ bookmark: Bookmark }> {
    return call(`/api/bookmarks/${id}/cover`, { method: 'DELETE' });
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

  /** Folds tags into one name, creating it when the library does not have it. */
  mergeTags(sourceIds: number[], target: string): Promise<{ merged: number; movedLinks: number }> {
    return call('/api/tags/merge', {
      method: 'POST',
      body: JSON.stringify({ sourceIds, target }),
    });
  },

  bulkDeleteTags(ids: number[]): Promise<{ deleted: number }> {
    return call('/api/tags/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) });
  },

  deleteTag(id: number): Promise<void> {
    return call(`/api/tags/${id}`, { method: 'DELETE' });
  },

  stats(): Promise<Stats> {
    return call('/api/stats');
  },

  importFile(
    file: File,
    options: boolean | ImportFileOptions = true,
  ): Promise<{ summary: ImportSummary }> {
    const opts: ImportFileOptions =
      typeof options === 'boolean' ? { fetchMetadata: options } : options;
    const form = new FormData();
    form.append('file', file);
    form.append('fetchMetadata', String(opts.fetchMetadata !== false));
    if (opts.checkLinks) form.append('checkLinks', 'true');
    if (opts.yearFilter !== undefined && opts.yearFilter !== null) {
      form.append('yearFilter', String(opts.yearFilter));
    }
    if (opts.yearMode) form.append('yearMode', opts.yearMode);
    if (opts.folderStrategy) form.append('folderStrategy', opts.folderStrategy);
    if (opts.defaultCollection) form.append('defaultCollection', opts.defaultCollection);
    return call('/api/import', { method: 'POST', body: form });
  },

  getAuditStatus(): Promise<AuditStatus> {
    return call('/api/audit-links');
  },

  startAudit(): Promise<AuditStatus> {
    return call('/api/audit-links', { method: 'POST' });
  },

  /** Starts an audit scan on only the bookmarks currently marked failed. */
  auditBrokenLinks(): Promise<AuditStatus> {
    return call('/api/audit-links/broken', { method: 'POST' });
  },

  cancelAudit(): Promise<{ cancelled: boolean }> {
    return call('/api/audit-links/cancel', { method: 'POST' });
  },

  mergeCollections(
    sourceIds: number[],
    targetId: number,
    options: { tagWithSourceNames?: boolean } = {},
  ): Promise<{ movedCount: number; deletedCollections: number; taggedCount: number }> {
    return call('/api/collections/merge', {
      method: 'POST',
      body: JSON.stringify({
        sourceIds,
        targetId,
        tagWithSourceNames: options.tagWithSourceNames ?? false,
      }),
    });
  },

  convertCollectionsToTags(
    collectionIds: number[],
  ): Promise<{ converted: number; bookmarksTagged: number }> {
    return call('/api/collections/convert-to-tags', {
      method: 'POST',
      body: JSON.stringify({ collectionIds }),
    });
  },

  getUncollectedDomains(limit?: number): Promise<UncollectedDomainsResponse> {
    const q = limit ? `?limit=${limit}` : '';
    return call(`/api/library/uncollected-domains${q}`);
  },

  batchAssignCollection(
    bookmarkIds: number[],
    collectionId: number | null,
  ): Promise<{ updatedCount: number }> {
    return call('/api/library/batch-assign-collection', {
      method: 'POST',
      body: JSON.stringify({ bookmarkIds, collectionId }),
    });
  },

  /** Decides the collections a filing run may use, before anything is filed. */
  planCollections(options?: { bookmarkIds?: number[] }): Promise<CollectionPlan> {
    return call('/api/ai/plan-collections', {
      method: 'POST',
      body: JSON.stringify(options ?? {}),
    });
  },

  /** Reviews the tag vocabulary and proposes merges for synonyms and plurals. */
  suggestTagCleanup(): Promise<TagCleanupPlan> {
    return call('/api/ai/suggest-tag-cleanup', { method: 'POST' });
  },

  /** Reviews the whole collection list and proposes merges and tag conversions. */
  suggestCollectionCleanup(): Promise<CleanupPlan> {
    return call('/api/ai/suggest-collection-cleanup', { method: 'POST' });
  },

  suggestBatchCategories(options?: {
    limit?: number;
    bookmarkIds?: number[];
    collections?: string[];
  }): Promise<AiBatchResult> {
    return call('/api/ai/suggest-categories', {
      method: 'POST',
      body: JSON.stringify(options ?? {}),
    });
  },

  applyBatchCategories(
    assignments: ApplyCategoryAssignment[],
  ): Promise<{ applied: number }> {
    return call('/api/ai/apply-categories', {
      method: 'POST',
      body: JSON.stringify({ assignments }),
    });
  },
};

