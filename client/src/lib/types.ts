export type MetadataStatus = 'pending' | 'ok' | 'partial' | 'failed' | 'manual';
export type AiStatus = 'none' | 'pending' | 'ok' | 'skipped' | 'failed';
export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface Bookmark {
  id: number;
  url: string;
  title: string;
  description: string;
  siteName: string;
  domain: string;
  faviconUrl: string | null;
  /** What a card shows: the custom cover when there is one, else the fetched preview. */
  previewUrl: string | null;
  /** Set only when this bookmark has a cover of its own. */
  coverUrl: string | null;
  collectionId: number | null;
  isPinned: boolean;
  tags: string[];
  metadataStatus: MetadataStatus;
  metadataError: string | null;
  metadataFetchedAt: string | null;
  aiStatus: AiStatus;
  aiError: string | null;
  aiAppliedAt: string | null;
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

export interface AiModel {
  id: string;
  note: string;
  efforts: ReasoningEffort[];
}

export interface AiSettings {
  /** False means no key anywhere, and the whole feature stays hidden. */
  configured: boolean;
  keySource: 'env' | 'settings' | 'none';
  keyHint: string | null;
  model: string;
  reasoningEffort: ReasoningEffort;
  autoRun: boolean;
  createCollections: boolean;
  models: AiModel[];
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
export type CardSize = 'small' | 'medium' | 'large';

export interface BookmarkDraft {
  url: string;
  title: string;
  description: string;
  collectionId: number | null;
  /**
   * Null unless the user picked "Create new collection" in the dialog. The
   * collection is made on save, so backing out of the dialog leaves nothing
   * behind.
   */
  newCollectionName: string | null;
  tags: string[];
  isPinned: boolean;
}
