import clsx from 'clsx';
import { Check } from 'lucide-react';

/**
 * The tick shown on a card or row while selection mode is on. It is decoration
 * only; `SelectOverlay` is the thing that takes the tap, the click and the key
 * press, so the whole card behaves like one big checkbox.
 */
export function SelectMark({ selected, size = 16 }: { selected: boolean; size?: number }) {
  return (
    <span
      aria-hidden
      className={clsx(
        'grid shrink-0 place-items-center rounded-md border transition-colors duration-150',
        selected
          ? 'border-accent bg-accent text-accent-ink'
          : 'border-line-strong bg-canvas/85 text-transparent backdrop-blur-sm',
      )}
      style={{ height: size + 8, width: size + 8 }}
    >
      <Check size={size - 2} strokeWidth={3} />
    </span>
  );
}

/**
 * Covers the card while selection mode is on so a tap picks the bookmark
 * instead of opening the link. It sits above the links and the actions menu,
 * which is why those stay reachable again the moment selection mode ends.
 */
export function SelectOverlay({
  selected,
  label,
  onToggle,
  rounded = 'rounded-(--radius-card)',
}: {
  selected: boolean;
  label: string;
  onToggle: () => void;
  rounded?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      role="checkbox"
      aria-checked={selected}
      aria-label={label}
      className={clsx(
        'absolute inset-0 z-20 transition-colors duration-150',
        'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent',
        selected ? 'bg-accent/10' : 'hover:bg-ink/5',
        rounded,
      )}
    />
  );
}
