export type MetadataStatus = 'pending' | 'ok' | 'partial' | 'failed' | 'manual';

export interface Bookmark {
  id: number;
  url: string;
  title: string;
  description: string;
  siteName: string;
  domain: string;
  faviconUrl: string | null;
  previewUrl: string | null;
  collectionId: number | null;
  isPinned: boolean;
  tags: string[];
  metadataStatus: MetadataStatus;
  metadataError: string | null;
  metadataFetchedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Collection {
  id: number;
  name: string;
  description: string | null;
  color: string | null;
  position: number;
  createdAt: string;
  bookmarkCount: number;
}

export interface Tag {
  id: number;
  name: string;
  bookmarkCount: number;
}

export interface Stats {
  total: number;
  pinned: number;
  untagged: number;
  uncollected: number;
  needsAttention: number;
  collections: number;
  tags: number;
  pendingJobs: number;
}

export interface ImportSummary {
  imported: number;
  duplicates: number;
  skipped: number;
  collectionsCreated: number;
  errors: string[];
}

export type SortKey = 'newest' | 'oldest' | 'title' | 'domain' | 'updated';
export type ViewMode = 'grid' | 'list';

export interface BookmarkDraft {
  url: string;
  title: string;
  description: string;
  collectionId: number | null;
  tags: string[];
  isPinned: boolean;
}
