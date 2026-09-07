import { useId, type ReactNode, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import clsx from 'clsx';

const CONTROL =
  'w-full rounded-lg bg-canvas border border-line px-3 py-2.5 text-ink placeholder:text-ink-faint ' +
  'transition-colors duration-150 hover:border-line-strong focus:border-accent focus:outline-none ' +
  'focus-visible:outline-none disabled:opacity-60';

interface FieldShellProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: (id: string, describedBy: string | undefined) => ReactNode;
}

export function Field({ label, hint, error, children }: FieldShellProps) {
  const id = useId();
  const messageId = error || hint ? `${id}-message` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[0.8125rem] font-semibold text-ink-muted">
        {label}
      </label>
      {children(id, messageId)}
      {error ? (
        <p id={messageId} role="alert" className="flex items-start gap-1.5 text-[0.8125rem] text-danger">
          <span aria-hidden>!</span>
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="text-[0.8125rem] text-ink-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function TextField({
  label,
  hint,
  error,
  className,
  ...rest
}: { label: string; hint?: ReactNode; error?: string | null } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(id, describedBy) => (
        <input
          id={id}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={clsx(CONTROL, error && 'border-danger', className)}
          {...rest}
        />
      )}
    </Field>
  );
}

export function TextArea({
  label,
  hint,
  error,
  className,
  ...rest
}: { label: string; hint?: ReactNode; error?: string | null } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(id, describedBy) => (
        <textarea
          id={id}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={clsx(CONTROL, 'resize-y min-h-20', error && 'border-danger', className)}
          {...rest}
        />
      )}
    </Field>
  );
}

export function SelectField({
  label,
  hint,
  error,
  className,
  children,
  ...rest
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(id, describedBy) => (
        <select id={id} aria-describedby={describedBy} className={clsx(CONTROL, 'pr-8', className)} {...rest}>
          {children}
        </select>
      )}
    </Field>
  );
}
