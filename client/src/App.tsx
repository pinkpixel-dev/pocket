import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookmarkX, Inbox, Pin, SearchX, TriangleAlert } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { BookmarkGrid, BookmarkSkeleton } from './components/BookmarkGrid';
import { EmptyState } from './components/EmptyState';
import { SettingsView } from './components/SettingsView';
import { BookmarkFormDialog, type FormMode } from './components/BookmarkFormDialog';
import { CollectionDialog } from './components/CollectionDialog';
import { ConfirmDialog } from './components/ConfirmDialog';
import { MoveDialog } from './components/MoveDialog';
import { useToast } from './components/ui/Toaster';
import { useLibrary } from './hooks/useLibrary';
import { api, ApiError } from './lib/api';
import { pluralize } from './lib/format';
import type { Bookmark, BookmarkDraft, Collection } from './lib/types';

function useViewHeading(library: ReturnType<typeof useLibrary>): { title: string; subtitle: string } {
  const { route, collections, total, search } = library;

  return useMemo(() => {
    const counted = search.trim()
      ? `${pluralize(total, 'match', 'matches')} for "${search.trim()}"`
      : pluralize(total, 'bookmark');

    switch (route.kind) {
      case 'pinned':
        return { title: 'Pinned', subtitle: counted };
      case 'settings':
        return { title: 'Settings', subtitle: 'Backups, collections and tags' };
      case 'uncollected':
        return { title: 'No collection', subtitle: counted };
      case 'untagged':
        return { title: 'Untagged', subtitle: counted };
      case 'collection': {
        const collection = collections.find((item) => item.id === route.id);
        return {
          title: collection?.name ?? 'Collection',
          subtitle: collection?.description || counted,
        };
      }
      default:
        return { title: 'All bookmarks', subtitle: counted };
    }
  }, [route, collections, total, search]);
}

export default function App() {
  const library = useLibrary();
  const toast = useToast();
  const heading = useViewHeading(library);

  const [navOpen, setNavOpen] = useState(false);
  const [busyIds, setBusyIds] = useState<ReadonlySet<number>>(new Set());

  const [formState, setFormState] = useState<{ open: boolean; mode: FormMode; bookmark: Bookmark | null }>({
    open: false,
    mode: 'create',
    bookmark: null,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [moveTarget, setMoveTarget] = useState<Bookmark | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Bookmark | null>(null);
  const [collectionDialog, setCollectionDialog] = useState<{ open: boolean; collection: Collection | null }>({
    open: false,
    collection: null,
  });
  const [collectionError, setCollectionError] = useState<string | null>(null);

  const markBusy = useCallback((id: number, busy: boolean) => {
    setBusyIds((current) => {
      const next = new Set(current);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  useEffect(() => {
    setNavOpen(false);
  }, [library.route]);

  const openCreate = useCallback(() => {
    setFormError(null);
    setFormState({ open: true, mode: 'create', bookmark: null });
  }, []);

  // "n" opens the save dialog, the one shortcut worth having by default.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if (event.key === 'n' && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        openCreate();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [openCreate]);

  const submitBookmark = async (draft: BookmarkDraft) => {
    setSaving(true);
    setFormError(null);

    try {
      if (formState.mode === 'edit' && formState.bookmark) {
        const { bookmark } = await api.updateBookmark(formState.bookmark.id, {
          url: draft.url,
          title: draft.title,
          description: draft.description,
          collectionId: draft.collectionId,
          tags: draft.tags,
          isPinned: draft.isPinned,
        });
        library.applyBookmark(bookmark);
        toast.success('Bookmark updated.');
      } else {
        await api.createBookmark({
          url: draft.url,
          title: draft.title || undefined,
          description: draft.description || undefined,
          collectionId: draft.collectionId,
          tags: draft.tags,
          isPinned: draft.isPinned,
        });
        await library.reload();
        toast.success('Saved. Fetching the preview now.');
      }
      setFormState((current) => ({ ...current, open: false }));
    } catch (error) {
      if (error instanceof ApiError) {
        const duplicate = error.duplicateBookmark;
        if (duplicate) {
          setFormError(null);
          setFormState((current) => ({ ...current, open: false }));
          toast.info('You already saved that link.', {
            label: 'Open it',
            onSelect: () => window.open(duplicate.url, '_blank', 'noopener'),
          });
          return;
        }
        setFormError(error.message);
      } else {
        setFormError('That could not be saved.');
      }
    } finally {
      setSaving(false);
    }
  };

  const togglePin = async (bookmark: Bookmark) => {
    markBusy(bookmark.id, true);
    try {
      const result = await api.setPinned(bookmark.id, !bookmark.isPinned);
      library.applyBookmark(result.bookmark);
      if (library.route.kind === 'pinned') await library.reload();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'That could not be pinned.');
    } finally {
      markBusy(bookmark.id, false);
    }
  };

  const refreshBookmark = async (bookmark: Bookmark) => {
    markBusy(bookmark.id, true);
    try {
      const result = await api.refreshBookmark(bookmark.id);
      library.applyBookmark(result.bookmark);
      if (result.bookmark.metadataStatus === 'failed') {
        toast.error(result.bookmark.metadataError ?? 'That page could not be read.');
      } else {
        toast.success('Preview refreshed.');
      }
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'The preview could not be refreshed.');
    } finally {
      markBusy(bookmark.id, false);
    }
  };

  const moveBookmark = async (collectionId: number | null) => {
    if (!moveTarget) return;
    markBusy(moveTarget.id, true);
    try {
      const { bookmark } = await api.updateBookmark(moveTarget.id, { collectionId });
      library.applyBookmark(bookmark);
      if (library.route.kind === 'collection' || library.route.kind === 'uncollected') await library.reload();
      toast.success('Moved.');
      setMoveTarget(null);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'That could not be moved.');
    } finally {
      markBusy(moveTarget.id, false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    markBusy(deleteTarget.id, true);
    try {
      await api.deleteBookmark(deleteTarget.id);
      library.removeBookmark(deleteTarget.id);
      toast.success('Bookmark deleted.');
      setDeleteTarget(null);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'That could not be deleted.');
    } finally {
      markBusy(deleteTarget.id, false);
    }
  };

  const submitCollection = async (input: { name: string; description: string | null; color: string | null }) => {
    setSaving(true);
    setCollectionError(null);
    try {
      if (collectionDialog.collection) {
        await api.updateCollection(collectionDialog.collection.id, input);
        toast.success('Collection updated.');
      } else {
        await api.createCollection(input);
        toast.success('Collection created.');
      }
      await library.reload();
      setCollectionDialog({ open: false, collection: null });
    } catch (error) {
      setCollectionError(error instanceof ApiError ? error.message : 'That could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const actions = {
    onEdit: (bookmark: Bookmark) => {
      setFormError(null);
      setFormState({ open: true, mode: 'edit', bookmark });
    },
    onMove: setMoveTarget,
    onTogglePin: (bookmark: Bookmark) => void togglePin(bookmark),
    onRefresh: (bookmark: Bookmark) => void refreshBookmark(bookmark),
    onDelete: setDeleteTarget,
  };

  const isSettings = library.route.kind === 'settings';

  return (
    <div className="flex min-h-dvh">
      <Sidebar
        route={library.route}
        collections={library.collections}
        tags={library.tags}
        stats={library.stats}
        open={navOpen}
        onClose={() => setNavOpen(false)}
        onCreateCollection={() => {
          setCollectionError(null);
          setCollectionDialog({ open: true, collection: null });
        }}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          title={heading.title}
          subtitle={heading.subtitle}
          search={library.search}
          onSearchChange={library.setSearch}
          sort={library.sort}
          onSortChange={library.setSort}
          view={library.view}
          onViewChange={library.setView}
          onOpenNav={() => setNavOpen(true)}
          onAdd={openCreate}
          showControls={!isSettings}
        />

        <main className="min-w-0 flex-1">
          {isSettings ? (
            <SettingsView
              stats={library.stats}
              collections={library.collections}
              tags={library.tags}
              onChanged={() => void library.reload()}
              onEditCollection={(collection) => {
                setCollectionError(null);
                setCollectionDialog({ open: true, collection });
              }}
            />
          ) : (
            <div className="px-3 py-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-5">
              {library.loadError ? (
                <div className="mx-auto max-w-md py-16">
                  <EmptyState
                    icon={<TriangleAlert size={22} aria-hidden />}
                    title="The library could not load"
                    message={library.loadError}
                    action={{ label: 'Try again', onSelect: () => void library.reload() }}
                  />
                </div>
              ) : library.loading ? (
                <BookmarkSkeleton view={library.view} />
              ) : library.bookmarks.length === 0 ? (
                <EmptyStateForRoute
                  route={library.route}
                  searching={Boolean(library.search.trim())}
                  onAdd={openCreate}
                  onClearSearch={() => library.setSearch('')}
                />
              ) : (
                <BookmarkGrid
                  bookmarks={library.bookmarks}
                  collections={library.collections}
                  view={library.view}
                  busyIds={busyIds}
                  {...actions}
                />
              )}
            </div>
          )}
        </main>
      </div>

      <BookmarkFormDialog
        open={formState.open}
        mode={formState.mode}
        bookmark={formState.bookmark}
        collections={library.collections}
        tags={library.tags}
        defaultCollectionId={library.route.kind === 'collection' ? library.route.id : null}
        saving={saving}
        error={formError}
        onClose={() => setFormState((current) => ({ ...current, open: false }))}
        onSubmit={(draft) => void submitBookmark(draft)}
      />

      <MoveDialog
        open={moveTarget !== null}
        bookmark={moveTarget}
        collections={library.collections}
        saving={moveTarget ? busyIds.has(moveTarget.id) : false}
        onClose={() => setMoveTarget(null)}
        onSubmit={(collectionId) => void moveBookmark(collectionId)}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete bookmark?"
        message={`"${deleteTarget?.title || deleteTarget?.url}" will be removed from your library. This cannot be undone.`}
        confirmLabel="Delete"
        busy={deleteTarget ? busyIds.has(deleteTarget.id) : false}
        onConfirm={() => void confirmDelete()}
        onClose={() => setDeleteTarget(null)}
      />

      <CollectionDialog
        open={collectionDialog.open}
        collection={collectionDialog.collection}
        saving={saving}
        error={collectionError}
        onClose={() => setCollectionDialog({ open: false, collection: null })}
        onSubmit={(input) => void submitCollection(input)}
      />
    </div>
  );
}

function EmptyStateForRoute({
  route,
  searching,
  onAdd,
  onClearSearch,
}: {
  route: ReturnType<typeof useLibrary>['route'];
  searching: boolean;
  onAdd: () => void;
  onClearSearch: () => void;
}) {
  if (searching) {
    return (
      <EmptyState
        icon={<SearchX size={22} aria-hidden />}
        title="Nothing matched"
        message="Try a shorter search, or look for part of the site name instead."
        action={{ label: 'Clear search', onSelect: onClearSearch }}
      />
    );
  }

  switch (route.kind) {
    case 'pinned':
      return (
        <EmptyState
          icon={<Pin size={22} aria-hidden />}
          title="Nothing pinned yet"
          message="Pin the links you come back to often and they will sit at the top of every view."
        />
      );
    case 'collection':
      return (
        <EmptyState
          icon={<Inbox size={22} aria-hidden />}
          title="This collection is empty"
          message="Save a link here, or move an existing one in from its card menu."
          action={{ label: 'Save a link', onSelect: onAdd }}
        />
      );
    case 'untagged':
    case 'uncollected':
      return (
        <EmptyState
          icon={<Inbox size={22} aria-hidden />}
          title="Nothing here"
          message="Everything in your library is filed away."
        />
      );
    default:
      return (
        <EmptyState
          icon={<BookmarkX size={22} aria-hidden />}
          title="Your library is empty"
          message="Paste a link and Pocket will fetch the title and preview for you. You can also import a browser export from Settings."
          action={{ label: 'Save your first link', onSelect: onAdd }}
        />
      );
  }
}
