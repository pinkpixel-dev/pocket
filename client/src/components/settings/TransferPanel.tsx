import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { Button } from '../ui/Button';
import { api, ApiError } from '../../lib/api';
import { useToast } from '../ui/Toaster';
import { pluralize } from '../../lib/format';
import type { ImportSummary } from '../../lib/types';

/** Matches the secondary Button, but stays an anchor so the download works. */
const DOWNLOAD_LINK =
  'inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-line bg-raised px-4 ' +
  'text-ink transition-colors duration-150 hover:border-line-strong hover:bg-hover';

export function TransferPanel({ onImported }: { onImported: () => void }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fetchMetadata, setFetchMetadata] = useState(true);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const runImport = async (file: File) => {
    setImporting(true);
    setSummary(null);
    try {
      const result = await api.importFile(file, fetchMetadata);
      setSummary(result.summary);
      toast.success(`Imported ${pluralize(result.summary.imported, 'bookmark')}.`);
      onImported();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'That file could not be imported.');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-[0.9375rem] font-semibold text-ink">Export</h3>
          <p className="text-[0.875rem] text-ink-muted">
            The HTML file imports into any browser. The JSON backup also keeps your collections and tags.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/api/export/html" download className={DOWNLOAD_LINK}>
            <Download size={16} aria-hidden />
            Browser bookmarks (HTML)
          </a>
          <a href="/api/export/json" download className={DOWNLOAD_LINK}>
            <Download size={16} aria-hidden />
            Full backup (JSON)
          </a>
        </div>
      </section>

      <section className="flex flex-col gap-3 border-t border-line pt-6">
        <div>
          <h3 className="text-[0.9375rem] font-semibold text-ink">Import</h3>
          <p className="text-[0.875rem] text-ink-muted">
            Takes a browser bookmark export or a Pocket JSON backup. Links you already have are skipped, and
            browser folders become collections.
          </p>
        </div>

        <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[0.875rem] text-ink">
          <input
            type="checkbox"
            checked={fetchMetadata}
            onChange={(event) => setFetchMetadata(event.target.checked)}
            className="h-4.5 w-4.5 shrink-0 accent-[var(--color-accent)]"
          />
          Fetch titles and previews after importing
        </label>

        <div>
          <input
            ref={fileRef}
            type="file"
            accept=".html,.htm,.json,text/html,application/json"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void runImport(file);
            }}
          />
          <Button onClick={() => fileRef.current?.click()} loading={importing}>
            <Upload size={16} aria-hidden />
            Choose a file
          </Button>
        </div>

        {summary ? (
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
            {[
              { label: 'Imported', value: summary.imported },
              { label: 'Already saved', value: summary.duplicates },
              { label: 'Collections added', value: summary.collectionsCreated },
              { label: 'Skipped', value: summary.skipped },
            ].map((item) => (
              <div key={item.label} className="bg-surface px-3 py-2.5">
                <dt className="text-[0.75rem] text-ink-faint">{item.label}</dt>
                <dd className="font-mono text-lg text-ink tabular-nums">{item.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {summary && summary.errors.length > 0 ? (
          <details className="rounded-xl border border-line bg-surface px-3 py-2.5">
            <summary className="cursor-pointer text-[0.875rem] text-ink-muted">
              {pluralize(summary.errors.length, 'link')} could not be imported
            </summary>
            <ul className="mt-2 flex flex-col gap-1 font-mono text-[0.75rem] text-ink-faint">
              {summary.errors.map((message) => (
                <li key={message} className="break-all">
                  {message}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>
    </div>
  );
}
