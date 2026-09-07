import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { AlertTriangle, Check, Info, X } from 'lucide-react';

type ToastTone = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
  action?: { label: string; onSelect: () => void };
}

interface ToastApi {
  success: (message: string, action?: Toast['action']) => void;
  error: (message: string, action?: Toast['action']) => void;
  info: (message: string, action?: Toast['action']) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider.');
  return context;
}

const ICONS: Record<ToastTone, ReactNode> = {
  success: <Check size={16} aria-hidden />,
  error: <AlertTriangle size={16} aria-hidden />,
  info: <Info size={16} aria-hidden />,
};

const TONE_STYLES: Record<ToastTone, string> = {
  success: 'text-positive',
  error: 'text-danger',
  info: 'text-accent',
};

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, message: string, action?: Toast['action']) => {
      const id = nextId++;
      setToasts((current) => [...current.slice(-3), { id, tone, message, action }]);
      // Errors stay long enough to read and act on; confirmations do not need to.
      window.setTimeout(() => dismiss(id), tone === 'error' ? 9000 : 4500);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (message, action) => push('success', message, action),
      error: (message, action) => push('error', message, action),
      info: (message, action) => push('info', message, action),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-3 bottom-3 z-50 flex flex-col gap-2 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-90"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex items-start gap-3 rounded-xl border border-line bg-raised px-3.5 py-3 shadow-xl shadow-black/50"
          >
            <span className={clsx('mt-0.5 shrink-0', TONE_STYLES[toast.tone])}>{ICONS[toast.tone]}</span>
            <p className="min-w-0 flex-1 text-[0.875rem] text-ink">{toast.message}</p>
            {toast.action ? (
              <button
                type="button"
                onClick={() => {
                  toast.action?.onSelect();
                  dismiss(toast.id);
                }}
                className="shrink-0 rounded-md px-1.5 py-0.5 text-[0.8125rem] font-semibold text-accent transition-colors hover:bg-accent-soft"
              >
                {toast.action.label}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss"
              className="-mr-1 shrink-0 rounded-md p-1 text-ink-faint transition-colors hover:bg-hover hover:text-ink"
            >
              <X size={14} aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
