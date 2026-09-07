import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

interface MenuProps {
  label: string;
  items: MenuItem[];
  trigger: (props: { onClick: (event: React.MouseEvent) => void; 'aria-expanded': boolean; id: string }) => ReactNode;
  align?: 'start' | 'end';
  menuClassName?: string;
}

/** A small roving-focus menu: arrows move, Enter picks, Escape returns focus. */
export function Menu({ label, items, trigger, align = 'end', menuClassName }: MenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerId = useId();

  useEffect(() => {
    if (!open) return;

    const handlePointer = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleScroll = () => setOpen(false);

    document.addEventListener('pointerdown', handlePointer);
    window.addEventListener('resize', handleScroll);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointer);
      window.removeEventListener('resize', handleScroll);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [open]);

  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [open]);

  const moveFocus = (delta: number) => {
    const buttons = [...(listRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    if (buttons.length === 0) return;
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = buttons[(index + delta + buttons.length) % buttons.length];
    next?.focus();
  };

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) containerRef.current?.querySelector<HTMLElement>(`#${CSS.escape(triggerId)}`)?.focus();
  };

  return (
    <div
      ref={containerRef}
      className="relative"
      onKeyDown={(event) => {
        if (!open) return;
        if (event.key === 'Escape') {
          event.stopPropagation();
          close(true);
        } else if (event.key === 'ArrowDown') {
          event.preventDefault();
          moveFocus(1);
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          moveFocus(-1);
        }
      }}
    >
      {trigger({
        id: triggerId,
        'aria-expanded': open,
        onClick: (event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((value) => !value);
        },
      })}

      {open ? (
        <div
          ref={listRef}
          role="menu"
          aria-label={label}
          className={clsx(
            'absolute z-30 min-w-48 overflow-hidden rounded-xl',
            'border border-line bg-raised p-1 shadow-xl shadow-black/50',
            align === 'end' ? 'right-0' : 'left-0',
            menuClassName ?? 'top-[calc(100%+0.375rem)]',
          )}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                close(false);
                item.onSelect();
              }}
              className={clsx(
                'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[0.875rem]',
                'transition-colors duration-100 disabled:cursor-not-allowed disabled:text-ink-faint',
                item.destructive
                  ? 'text-danger hover:bg-danger-soft'
                  : 'text-ink-muted hover:bg-hover hover:text-ink',
              )}
            >
              {item.icon ? <span className="shrink-0 text-current">{item.icon}</span> : null}
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
