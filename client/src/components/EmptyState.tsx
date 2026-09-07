import type { ReactNode } from 'react';
import { Button } from './ui/Button';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  message: string;
  action?: { label: string; onSelect: () => void };
}

export function EmptyState({ icon, title, message, action }: EmptyStateProps) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-20 text-center">
      <span className="texture-grain grid h-14 w-14 place-items-center rounded-2xl border border-line bg-surface text-ink-faint">
        {icon}
      </span>
      <h2 className="text-lg text-ink">{title}</h2>
      <p className="text-[0.9375rem] text-ink-muted">{message}</p>
      {action ? (
        <Button variant="primary" onClick={action.onSelect} className="mt-1">
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}
