import { TransferPanel } from './settings/TransferPanel';
import { OrganizePanel } from './settings/OrganizePanel';
import { SelectField } from './ui/Field';
import { pluralize } from '../lib/format';
import type { CardSize, Collection, Stats, Tag } from '../lib/types';

interface SettingsViewProps {
  stats: Stats | null;
  collections: Collection[];
  tags: Tag[];
  cardSize: CardSize;
  onCardSizeChange: (value: CardSize) => void;
  onChanged: () => void;
  onEditCollection: (collection: Collection) => void;
}

const CARD_SIZES: Array<{ value: CardSize; label: string }> = [
  { value: 'small', label: 'Small — most links on screen' },
  { value: 'medium', label: 'Medium — the default' },
  { value: 'large', label: 'Large — big previews' },
];

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-(--radius-card) border border-line bg-surface p-5">
      <h2 className="mb-4 text-base text-ink">{title}</h2>
      {children}
    </section>
  );
}

export function SettingsView({
  stats,
  collections,
  tags,
  cardSize,
  onCardSizeChange,
  onChanged,
  onEditCollection,
}: SettingsViewProps) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-3 py-5 sm:px-6 sm:py-6">
      <Panel title="Your library">
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
          {[
            { label: 'Bookmarks', value: stats?.total ?? 0 },
            { label: 'Pinned', value: stats?.pinned ?? 0 },
            { label: 'Collections', value: stats?.collections ?? 0 },
            { label: 'Tags', value: stats?.tags ?? 0 },
          ].map((item) => (
            <div key={item.label} className="bg-surface px-3 py-3">
              <dt className="text-[0.75rem] text-ink-faint">{item.label}</dt>
              <dd className="font-mono text-xl text-ink tabular-nums">{item.value}</dd>
            </div>
          ))}
        </dl>

        {stats && stats.needsAttention > 0 ? (
          <p className="mt-3 text-[0.875rem] text-ink-muted">
            {pluralize(stats.needsAttention, 'bookmark')} could not be read when Pocket last tried. Use
            "Refresh preview" on a card to try again.
          </p>
        ) : null}
      </Panel>

      <Panel title="Appearance">
        <SelectField
          label="Card size"
          hint="How big the cards are in grid view. Smaller cards fit more links on screen and drop the description to stay readable."
          value={cardSize}
          onChange={(event) => onCardSizeChange(event.target.value as CardSize)}
        >
          {CARD_SIZES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
      </Panel>

      <Panel title="Backup and transfer">
        <TransferPanel onImported={onChanged} />
      </Panel>

      <Panel title="Collections and tags">
        <OrganizePanel
          collections={collections}
          tags={tags}
          onChanged={onChanged}
          onEditCollection={onEditCollection}
        />
      </Panel>

      <Panel title="About Pocket">
        <div className="flex flex-col gap-3 text-[0.875rem] text-ink-muted">
          <p>
            Pocket runs entirely on your own hardware. Bookmarks live in a SQLite file and cached previews sit
            beside it in your mounted data directory, so a normal file backup captures everything.
          </p>
          <p>
            It has no login of its own. Keep it on a trusted network, or put it behind a reverse proxy with
            authentication before letting it reach the open internet.
          </p>
          <p className="text-ink-faint">
            Made with care by{' '}
            <a
              href="https://pinkpixel.dev"
              target="_blank"
              rel="noreferrer noopener"
              className="text-accent hover:underline"
            >
              Pink Pixel
            </a>
          </p>
        </div>
      </Panel>
    </div>
  );
}
