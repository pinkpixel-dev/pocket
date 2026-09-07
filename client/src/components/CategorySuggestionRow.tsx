import clsx from 'clsx';
import { Globe, Tag as TagIcon } from 'lucide-react';
import type { CategorySuggestion } from '../lib/types';

interface CategorySuggestionRowProps {
  item: CategorySuggestion;
  selected: boolean;
  collectionName: string;
  /** The names the filing run was allowed to use, offered as a datalist. */
  options: string[];
  onToggle: (id: number) => void;
  onCollectionChange: (id: number, value: string) => void;
}

/** One reviewed bookmark: what it is, where it is going, and what it will be tagged. */
export function CategorySuggestionRow({
  item,
  selected,
  collectionName,
  options,
  onToggle,
  onCollectionChange,
}: CategorySuggestionRowProps) {
  const listId = 'ai-collection-options';

  return (
    <div
      className={clsx(
        'flex flex-col gap-2 rounded-xl border p-3 transition-colors sm:flex-row sm:items-center sm:justify-between',
        selected ? 'border-line-strong bg-raised' : 'border-line bg-surface opacity-60 hover:opacity-100',
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(item.bookmarkId)}
          aria-label={`Include ${item.currentTitle}`}
          className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
        />
        <div className="min-w-0 flex-1">
          <span className="block truncate text-[0.875rem] font-medium text-ink">
            {item.currentTitle}
          </span>
          <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[0.75rem] text-ink-muted">
            <span className="flex items-center gap-1">
              <Globe size={12} className="shrink-0 text-ink-faint" aria-hidden />
              {item.domain || item.url}
            </span>
            {item.tags.length > 0 ? (
              <span className="flex items-center gap-1">
                <TagIcon size={12} className="shrink-0 text-ink-faint" aria-hidden />
                {item.tags.join(', ')}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 pl-7 sm:pl-0">
        <datalist id={listId}>
          {options.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <input
          type="text"
          list={listId}
          value={collectionName}
          onChange={(event) => onCollectionChange(item.bookmarkId, event.target.value)}
          placeholder="Leave unfiled"
          className="w-40 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[0.8125rem] text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none sm:w-48"
          aria-label={`Collection for ${item.currentTitle}`}
        />
        {item.isNew && collectionName ? (
          <span className="shrink-0 rounded bg-accent/15 px-1.5 py-0.5 text-[0.6875rem] font-medium text-accent">
            New
          </span>
        ) : null}
      </div>
    </div>
  );
}
