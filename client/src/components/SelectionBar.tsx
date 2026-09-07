import { CheckCheck, CheckCircle2, Trash2, X } from 'lucide-react';
import { Button } from './ui/Button';
import { pluralize } from '../lib/format';

interface SelectionBarProps {
  count: number;
  /** How many bookmarks match the current view, loaded or not. */
  total: number;
  allSelected: boolean;
  selectingAll: boolean;
  deleting: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onDelete: () => void;
  onExit: () => void;
  onDismissBroken?: () => void;
  dismissing?: boolean;
}

/**
 * Sits under the top bar while selection mode is on. It stays put on a phone,
 * so the delete button is always in reach no matter how far down the list you
 * have picked things.
 */
export function SelectionBar({
  count,
  total,
  allSelected,
  selectingAll,
  deleting,
  onSelectAll,
  onClear,
  onDelete,
  onExit,
  onDismissBroken,
  dismissing = false,
}: SelectionBarProps) {
  return (
    <div
      role="toolbar"
      aria-label="Selection actions"
      className="flex flex-wrap items-center gap-2 border-t border-line bg-raised/80 px-3 py-2.5 sm:px-6"
    >
      <p aria-live="polite" className="mr-auto min-w-0 text-[0.8125rem] text-ink">
        {count > 0 ? `${count} selected` : 'Nothing selected'}
      </p>

      <Button
        size="sm"
        onClick={allSelected ? onClear : onSelectAll}
        loading={selectingAll}
        disabled={total === 0}
        title={allSelected ? 'Clear the selection' : `Select all ${total}`}
      >
        {allSelected ? <X size={15} aria-hidden /> : <CheckCheck size={15} aria-hidden />}
        {allSelected ? 'Clear' : `Select all ${total}`}
      </Button>

      {onDismissBroken ? (
        <Button
          size="sm"
          variant="secondary"
          onClick={onDismissBroken}
          loading={dismissing}
          disabled={count === 0}
          title={count === 0 ? 'Pick a bookmark first' : `Mark ${pluralize(count, 'bookmark')} as working`}
        >
          <CheckCircle2 size={15} aria-hidden />
          Mark as working{count > 0 ? ` (${count})` : ''}
        </Button>
      ) : null}

      <Button
        size="sm"
        variant="danger"
        onClick={onDelete}
        loading={deleting}
        disabled={count === 0}
        title={count === 0 ? 'Pick a bookmark first' : `Delete ${pluralize(count, 'bookmark')}`}
      >
        <Trash2 size={15} aria-hidden />
        Delete{count > 0 ? ` (${count})` : ''}
      </Button>

      <Button size="sm" variant="ghost" onClick={onExit} disabled={deleting || dismissing}>
        Done
      </Button>
    </div>
  );
}
