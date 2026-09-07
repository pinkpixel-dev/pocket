import { useId, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { Tag } from '../lib/types';

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions: Tag[];
  label?: string;
}

const clean = (raw: string): string =>
  raw.trim().replace(/\s+/g, ' ').replace(/[,#]/g, '').slice(0, 60).toLowerCase();

/** Chip input: Enter or comma commits, Backspace on an empty field removes. */
export function TagInput({ value, onChange, suggestions, label = 'Tags' }: TagInputProps) {
  const [draft, setDraft] = useState('');
  const inputId = useId();
  const listId = `${inputId}-suggestions`;
  const inputRef = useRef<HTMLInputElement>(null);

  const available = useMemo(
    () => suggestions.filter((tag) => !value.includes(tag.name)).slice(0, 40),
    [suggestions, value],
  );

  const add = (raw: string) => {
    const name = clean(raw);
    if (!name || value.includes(name) || value.length >= 30) {
      setDraft('');
      return;
    }
    onChange([...value, name]);
    setDraft('');
  };

  const remove = (name: string) => onChange(value.filter((tag) => tag !== name));

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-[0.8125rem] font-semibold text-ink-muted">
        {label}
      </label>

      <div
        onClick={() => inputRef.current?.focus()}
        className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border border-line bg-canvas px-2 py-1.5 transition-colors focus-within:border-accent hover:border-line-strong"
      >
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-md bg-raised py-1 pr-1 pl-2 font-mono text-[0.75rem] text-ink"
          >
            {tag}
            <button
              type="button"
              onClick={() => remove(tag)}
              aria-label={`Remove tag ${tag}`}
              className="grid h-5 w-5 place-items-center rounded text-ink-faint transition-colors hover:bg-hover hover:text-danger"
            >
              <X size={12} aria-hidden />
            </button>
          </span>
        ))}

        <input
          id={inputId}
          ref={inputRef}
          list={listId}
          value={draft}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={value.length ? '' : 'reading, tools, recipes…'}
          onChange={(event) => {
            const next = event.target.value;
            // A pasted or picked value ending in a comma commits straight away.
            if (next.includes(',')) {
              for (const part of next.split(',')) add(part);
              return;
            }
            setDraft(next);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add(draft);
            } else if (event.key === 'Backspace' && !draft && value.length) {
              event.preventDefault();
              remove(value[value.length - 1]!);
            }
          }}
          onBlur={() => add(draft)}
          className="min-w-32 flex-1 bg-transparent px-1 py-1 text-[0.9375rem] text-ink placeholder:text-ink-faint focus:outline-none"
        />

        <datalist id={listId}>
          {available.map((tag) => (
            <option key={tag.id} value={tag.name} />
          ))}
        </datalist>
      </div>

      <p className="text-[0.8125rem] text-ink-faint">Press Enter or type a comma to add a tag.</p>
    </div>
  );
}
