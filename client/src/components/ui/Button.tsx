import { forwardRef, type ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-accent text-accent-ink font-semibold hover:bg-accent-hover active:bg-accent disabled:bg-accent/40 disabled:text-accent-ink/60',
  secondary:
    'bg-raised text-ink border border-line hover:bg-hover hover:border-line-strong active:bg-raised disabled:text-ink-faint',
  ghost:
    'text-ink-muted hover:bg-raised hover:text-ink active:bg-hover disabled:text-ink-faint disabled:hover:bg-transparent',
  danger:
    'bg-danger-soft text-danger border border-danger/40 hover:bg-danger hover:text-ink active:bg-danger/80 disabled:opacity-50',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-[0.8125rem] gap-1.5',
  md: 'h-11 px-4 gap-2',
  icon: 'h-10 w-10 shrink-0',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading = false, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center rounded-lg whitespace-nowrap select-none',
        'transition-colors duration-150 ease-(--ease-out-soft)',
        'disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
});
