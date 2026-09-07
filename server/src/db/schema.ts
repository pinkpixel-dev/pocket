import type Database from 'better-sqlite3';

interface Migration {
  readonly id: number;
  readonly name: string;
  readonly up: (db: Database.Database) => void;
}

const migrations: Migration[] = [
  {
    id: 1,
    name: 'initial-library',
    up: (db) => {
      db.exec(`
        CREATE TABLE collections (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          name         TEXT    NOT NULL UNIQUE,
          description  TEXT,
          color        TEXT,
          position     INTEGER NOT NULL DEFAULT 0,
          created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE tags (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          name       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
          created_at TEXT    NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE bookmarks (
          id                  INTEGER PRIMARY KEY AUTOINCREMENT,
          url                 TEXT    NOT NULL,
          normalized_url      TEXT    NOT NULL UNIQUE,
          title               TEXT    NOT NULL DEFAULT '',
          description         TEXT    NOT NULL DEFAULT '',
          site_name           TEXT    NOT NULL DEFAULT '',
          favicon_path        TEXT,
          preview_path        TEXT,
          collection_id       INTEGER REFERENCES collections(id) ON DELETE SET NULL,
          is_pinned           INTEGER NOT NULL DEFAULT 0,
          metadata_status     TEXT    NOT NULL DEFAULT 'pending',
          metadata_error      TEXT,
          metadata_fetched_at TEXT,
          created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
          updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE bookmark_tags (
          bookmark_id INTEGER NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
          tag_id      INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
          PRIMARY KEY (bookmark_id, tag_id)
        );

        CREATE INDEX idx_bookmarks_created  ON bookmarks(created_at DESC);
        CREATE INDEX idx_bookmarks_pinned   ON bookmarks(is_pinned, created_at DESC);
        CREATE INDEX idx_bookmarks_coll     ON bookmarks(collection_id);
        CREATE INDEX idx_bookmark_tags_tag  ON bookmark_tags(tag_id);
      `);
    },
  },
  {
    id: 2,
    name: 'ai-assist',
    up: (db) => {
      db.exec(`
        CREATE TABLE settings (
          key        TEXT PRIMARY KEY,
          value      TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        ALTER TABLE bookmarks ADD COLUMN ai_status     TEXT NOT NULL DEFAULT 'none';
        ALTER TABLE bookmarks ADD COLUMN ai_error      TEXT;
        ALTER TABLE bookmarks ADD COLUMN ai_applied_at TEXT;
      `);
    },
  },
];

export function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    db.prepare('SELECT id FROM schema_migrations').all().map((row) => (row as { id: number }).id),
  );
  const record = db.prepare('INSERT INTO schema_migrations (id, name) VALUES (?, ?)');

  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    db.transaction(() => {
      migration.up(db);
      record.run(migration.id, migration.name);
    })();
  }
}
