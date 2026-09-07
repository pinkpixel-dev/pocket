import { useEffect, useRef, type ReactNode } from 'react';
import clsx from 'clsx';
import { X } from 'lucide-react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md';
}

/**
 * Built on the native dialog element, which brings the focus trap, the
 * Escape key and inert background content along for free.
 */
export function Dialog({ open, onClose, title, description, children, footer, size = 'md' }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      onMouseDown={(event) => {
        // A click that starts on the backdrop rather than inside the panel.
        if (event.target === ref.current) onClose();
      }}
      className={clsx(
        'm-0 w-full bg-transparent p-0 text-ink backdrop:bg-black/70 backdrop:backdrop-blur-[2px]',
        'max-h-none max-w-none place-self-end sm:place-self-center',
        'open:flex justify-center',
      )}
    >
      <div
        className={clsx(
          'flex w-full flex-col overflow-hidden border border-line bg-surface shadow-2xl shadow-black/50',
          'max-h-[92dvh] rounded-t-2xl sm:my-8 sm:rounded-2xl',
          size === 'sm' ? 'sm:max-w-md' : 'sm:max-w-xl',
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id="dialog-title" className="text-lg text-ink">
              {title}
            </h2>
            {description ? <p className="mt-0.5 text-[0.8125rem] text-ink-muted">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-raised hover:text-ink"
          >
            <X size={18} aria-hidden />
          </button>
        </header>

        <div className="scroll-area min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>

        {footer ? (
          <footer className="flex flex-wrap justify-end gap-2 border-t border-line bg-canvas/60 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {footer}
          </footer>
        ) : null}
      </div>
    </dialog>
  );
}
