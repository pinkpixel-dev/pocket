import { useEffect, useState, useCallback } from 'react';
import { Sparkles, FolderPlus, Globe, Check, Plus } from 'lucide-react';
import clsx from 'clsx';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { useToast } from '../ui/Toaster';
import { api, ApiError } from '../../lib/api';
import type { Collection, UncollectedDomainGroup } from '../../lib/types';
import { pluralize } from '../../lib/format';

interface UncollectedTriageProps {
  collections: Collection[];
  onChanged: () => void;
  onAiCategorize: (bookmarkIds?: number[], domain?: string) => void;
}

export function UncollectedTriage({
  collections,
  onChanged,
  onAiCategorize,
}: UncollectedTriageProps) {
  const toast = useToast();
  const [domains, setDomains] = useState<UncollectedDomainGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [assigningGroup, setAssigningGroup] = useState<UncollectedDomainGroup | null>(null);
  const [targetCollectionId, setTargetCollectionId] = useState<number | 'new' | null>(null);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [saving, setSaving] = useState(false);

  const loadDomains = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getUncollectedDomains(20);
      setDomains(res.domains);
    } catch {
      // Ignored if unavailable
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDomains();
  }, [loadDomains]);

  const totalUncollectedCount = domains.reduce((acc, d) => acc + d.count, 0);

  const handleBatchAssign = async () => {
    if (!assigningGroup || targetCollectionId === null) return;
    setSaving(true);

    try {
      let colId: number;
      let colName: string;

      if (targetCollectionId === 'new') {
        const name = newCollectionName.trim();
        if (!name) {
          toast.error('Please enter a collection name.');
          setSaving(false);
          return;
        }
        const created = await api.createCollection({ name });
        colId = created.collection.id;
        colName = created.collection.name;
      } else {
        colId = targetCollectionId;
        const found = collections.find((c) => c.id === colId);
        colName = found ? found.name : 'collection';
      }

      await api.batchAssignCollection(assigningGroup.bookmarkIds, colId);
      toast.success(
        `Assigned ${pluralize(assigningGroup.count, 'bookmark')} from ${assigningGroup.domain} to "${colName}".`,
      );
      setAssigningGroup(null);
      setTargetCollectionId(null);
      setNewCollectionName('');
      onChanged();
      void loadDomains();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to assign bookmarks.');
    } finally {
      setSaving(false);
    }
  };

  if (!loading && domains.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-3 border-t border-line pt-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-[0.9375rem] font-semibold text-ink">Uncollected bookmarks triage</h3>
          <p className="text-[0.875rem] text-ink-muted">
            Grouped by domain ({pluralize(totalUncollectedCount, 'bookmark')}) to help file batches into collections quickly.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => onAiCategorize()}
          className="self-start sm:self-auto"
        >
          <Sparkles size={15} className="text-accent" aria-hidden />
          AI categorize uncollected
        </Button>
      </div>

      <div className="flex flex-col gap-1.5 pt-1">
        {domains.map((group) => (
          <div
            key={group.domain}
            className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-line/60 bg-surface px-3 py-2 transition-colors hover:border-line"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <Globe size={15} className="shrink-0 text-ink-faint" aria-hidden />
              <span className="truncate text-[0.875rem] font-medium text-ink">
                {group.domain}
              </span>
              <span className="shrink-0 rounded bg-raised px-2 py-0.5 font-mono text-[0.75rem] text-ink-muted">
                {pluralize(group.count, 'link')}
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onAiCategorize(group.bookmarkIds, group.domain)}
                className="text-[0.8125rem]"
              >
                <Sparkles size={13} className="text-accent" aria-hidden />
                <span className="hidden sm:inline">AI suggest</span>
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setAssigningGroup(group);
                  setTargetCollectionId(null);
                  setNewCollectionName('');
                }}
                className="text-[0.8125rem]"
              >
                <FolderPlus size={14} aria-hidden />
                <span>Assign</span>
              </Button>
            </div>
          </div>
        ))}
      </div>

      {assigningGroup ? (
        <Dialog
          open={true}
          onClose={() => setAssigningGroup(null)}
          size="md"
          title={`Assign ${assigningGroup.domain} bookmarks`}
          description={`Move ${pluralize(assigningGroup.count, 'bookmark')} from ${assigningGroup.domain} into a collection.`}
          footer={
            <>
              <Button onClick={() => setAssigningGroup(null)} disabled={saving}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleBatchAssign}
                loading={saving}
                disabled={
                  targetCollectionId === null ||
                  (targetCollectionId === 'new' && !newCollectionName.trim())
                }
              >
                Assign bookmarks
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-[0.8125rem] font-medium text-ink-muted">
                Choose collection:
              </label>
              <div className="mt-2 flex max-h-56 flex-col gap-1 overflow-y-auto pr-1">
                {collections.map((col) => (
                  <button
                    key={col.id}
                    type="button"
                    onClick={() => setTargetCollectionId(col.id)}
                    className={clsx(
                      'flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-[0.875rem] transition-colors',
                      targetCollectionId === col.id
                        ? 'bg-raised font-semibold text-ink'
                        : 'text-ink-muted hover:bg-surface hover:text-ink',
                    )}
                  >
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: col.color ?? 'var(--color-line-strong)' }}
                    />
                    <span className="min-w-0 flex-1 truncate">{col.name}</span>
                    <span className="shrink-0 text-[0.75rem] text-ink-faint">
                      {pluralize(col.bookmarkCount, 'bookmark')}
                    </span>
                    {targetCollectionId === col.id ? (
                      <Check size={16} className="shrink-0 text-accent" aria-hidden />
                    ) : null}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => setTargetCollectionId('new')}
                  className={clsx(
                    'flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-[0.875rem] transition-colors',
                    targetCollectionId === 'new'
                      ? 'bg-raised font-semibold text-ink'
                      : 'text-ink-muted hover:bg-surface hover:text-ink',
                  )}
                >
                  <Plus size={16} className="shrink-0 text-accent" aria-hidden />
                  <span className="min-w-0 flex-1">Create new collection...</span>
                  {targetCollectionId === 'new' ? (
                    <Check size={16} className="shrink-0 text-accent" aria-hidden />
                  ) : null}
                </button>
              </div>
            </div>

            {targetCollectionId === 'new' ? (
              <div className="flex flex-col gap-1.5 border-t border-line pt-2">
                <label htmlFor="triage-new-collection-name" className="text-[0.8125rem] text-ink-muted">
                  New collection name:
                </label>
                <input
                  id="triage-new-collection-name"
                  type="text"
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  placeholder={`e.g. ${assigningGroup.domain.split('.')[0] ?? 'Articles'}`}
                  autoFocus
                  maxLength={80}
                  className="rounded-lg border border-line bg-surface px-3 py-2 text-[0.875rem] text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
                />
              </div>
            ) : null}
          </div>
        </Dialog>
      ) : null}
    </section>
  );
}
