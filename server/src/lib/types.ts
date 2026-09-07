export type MetadataStatus = 'pending' | 'ok' | 'partial' | 'failed' | 'manual';

export interface BookmarkRow {
  id: number;
  url: string;
  normalized_url: string;
  title: string;
  description: string;
  site_name: string;
  favicon_path: string | null;
  preview_path: string | null;
  collection_id: number | null;
  is_pinned: number;
  metadata_status: MetadataStatus;
  metadata_error: string | null;
  metadata_fetched_at: string | null;
  created_at: string;
  updated_at: string;
}

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

export type SortKey = 'newest' | 'oldest' | 'title' | 'domain' | 'updated';

export interface BookmarkQuery {
  search?: string;
  collectionId?: number | null;
  tag?: string;
  pinned?: boolean;
  untagged?: boolean;
  uncollected?: boolean;
  sort?: SortKey;
  limit?: number;
  offset?: number;
}
