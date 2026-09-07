import { useState } from 'react';
import { Check, ExternalLink, KeyRound, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { SelectField, TextField } from '../ui/Field';
import { api, ApiError } from '../../lib/api';
import { useToast } from '../ui/Toaster';
import type { AiSettings } from '../../lib/types';

interface AiPanelProps {
  settings: AiSettings | null;
  onChanged: (settings: AiSettings) => void;
}

const EFFORT_HINT: Record<string, string> = {
  none: 'no thinking, cheapest and fastest',
  minimal: 'barely any thinking, cheapest',
  low: 'a little thinking, plenty for this',
  medium: 'more thinking than filing a bookmark needs',
  high: 'far more thinking than filing a bookmark needs',
  xhigh: 'far more thinking than filing a bookmark needs',
  max: 'far more thinking than filing a bookmark needs',
};

function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-1.5 has-disabled:cursor-not-allowed has-disabled:opacity-60">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4.5 w-4.5 shrink-0 accent-[var(--color-accent)]"
      />
      <span className="min-w-0">
        <span className="block text-[0.9375rem] text-ink">{label}</span>
        <span className="block text-[0.8125rem] text-ink-faint">{hint}</span>
      </span>
    </label>
  );
}

export function AiPanel({ settings, onChanged }: AiPanelProps) {
  const toast = useToast();
  const [keyDraft, setKeyDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);

  if (!settings) {
    return <div className="h-24 animate-pulse rounded-xl bg-raised" aria-label="Loading AI settings" />;
  }

  const fromEnv = settings.keySource === 'env';
  const model = settings.models.find((item) => item.id === settings.model);

  const save = async (input: Parameters<typeof api.updateAiSettings>[0], message: string) => {
    setBusy(true);
    setKeyError(null);
    try {
      const { ai } = await api.updateAiSettings(input);
      onChanged(ai);
      toast.success(message);
      return true;
    } catch (error) {
      const text = error instanceof ApiError ? error.message : 'That could not be saved.';
      if (input.apiKey !== undefined) setKeyError(text);
      else toast.error(text);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveKey = async () => {
    if (!keyDraft.trim()) return;
    if (await save({ apiKey: keyDraft }, 'Key saved. Pocket will fill in new links from now on.')) {
      setKeyDraft('');
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[0.875rem] text-ink-muted">
        With a key set, Pocket asks OpenAI to fill in whatever a page did not provide: the title, a
        description, a few tags, and the collection it belongs in. It runs after the normal preview fetch, so
        it only ever writes into a blank field. Anything you typed yourself is left alone.
      </p>

      <div className="flex flex-col gap-2">
        {settings.configured ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-canvas px-3 py-2.5">
            <span className="inline-flex items-center gap-2 text-[0.875rem] text-ink">
              <Check size={15} className="text-accent" aria-hidden />
              Connected
            </span>
            <code className="font-mono text-[0.8125rem] text-ink-faint">{settings.keyHint}</code>
            <span className="ml-auto text-[0.75rem] text-ink-faint">
              {fromEnv ? 'from POCKET_OPENAI_API_KEY' : 'stored in your database'}
            </span>
            {fromEnv ? null : (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove the stored key"
                disabled={busy}
                className="hover:text-danger"
                onClick={() => void save({ apiKey: '' }, 'Key removed. The AI features are off again.')}
              >
                <Trash2 size={15} aria-hidden />
              </Button>
            )}
          </div>
        ) : null}

        {fromEnv ? null : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <TextField
                label={settings.configured ? 'Replace the key' : 'OpenAI API key'}
                type="password"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="sk-..."
                value={keyDraft}
                error={keyError}
                onChange={(event) => setKeyDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void saveKey();
                }}
                hint={
                  <>
                    Stored as plain text in your Pocket database, which means it is also in your backups. Get
                    one from{' '}
                    <a
                      href="https://platform.openai.com/api-keys"
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 text-accent hover:underline"
                    >
                      platform.openai.com
                      <ExternalLink size={11} aria-hidden />
                    </a>
                  </>
                }
              />
            </div>
            <Button
              variant="primary"
              loading={busy}
              disabled={!keyDraft.trim()}
              onClick={() => void saveKey()}
              className="sm:mb-7"
            >
              <KeyRound size={15} aria-hidden />
              Save key
            </Button>
          </div>
        )}
      </div>

      {settings.configured ? (
        <div className="flex flex-col gap-4 border-t border-line pt-5">
          <SelectField
            label="Model"
            value={settings.model}
            disabled={busy}
            hint={model?.note}
            onChange={(event) => void save({ model: event.target.value }, 'Model updated.')}
          >
            {settings.models.map((item) => (
              <option key={item.id} value={item.id}>
                {item.id}
              </option>
            ))}
          </SelectField>

          <SelectField
            label="Thinking effort"
            value={settings.reasoningEffort}
            disabled={busy}
            hint="Filing a bookmark is not a hard problem. More thinking mostly costs more."
            onChange={(event) => void save({ reasoningEffort: event.target.value }, 'Effort updated.')}
          >
            {(model?.efforts ?? []).map((effort) => (
              <option key={effort} value={effort}>
                {effort} — {EFFORT_HINT[effort]}
              </option>
            ))}
          </SelectField>

          <div className="flex flex-col border-t border-line pt-4">
            <Toggle
              label="Fill in new links automatically"
              hint="Runs once per newly saved link, right after the preview arrives. Turn this off to only ever run it from a card's menu."
              checked={settings.autoRun}
              disabled={busy}
              onChange={(value) =>
                void save({ autoRun: value }, value ? 'New links will be filled in.' : 'Automatic filling is off.')
              }
            />
            <Toggle
              label="Let it create new collections"
              hint="It reuses one of yours whenever a link fits. With this off it can only pick from collections you already made."
              checked={settings.createCollections}
              disabled={busy}
              onChange={(value) =>
                void save(
                  { createCollections: value },
                  value ? 'It can create collections.' : 'It will only use collections you made.',
                )
              }
            />
          </div>

          <p className="text-[0.8125rem] text-ink-faint">
            Imported bookmarks are skipped on purpose, since a browser export can be thousands of links and
            each one is a paid request. Use "Fill in with AI" on a card to run those yourself.
          </p>
        </div>
      ) : null}
    </div>
  );
}
