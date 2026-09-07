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
  {
    id: 3,
    name: 'custom-covers',
    up: (db) => {
      db.exec(`ALTER TABLE bookmarks ADD COLUMN cover_path TEXT;`);
    },
  },
  {
    id: 4,
    name: 'accounts',
    up: (db) => {
      // Every library table gains an owner. SQLite cannot add a column to an
      // existing UNIQUE constraint, so the four tables that had one are
      // rebuilt: two people on the same NAS must be able to save the same URL,
      // and to each have a collection called "Reading".
      db.exec(`
        CREATE TABLE users (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
          display_name  TEXT    NOT NULL DEFAULT '',
          password_hash TEXT,
          is_owner      INTEGER NOT NULL DEFAULT 0,
          created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
          updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE sessions (
          token_hash   TEXT    PRIMARY KEY,
          user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
          last_seen_at TEXT    NOT NULL DEFAULT (datetime('now')),
          expires_at   TEXT    NOT NULL,
          user_agent   TEXT    NOT NULL DEFAULT ''
        );

        CREATE INDEX idx_sessions_user    ON sessions(user_id);
        CREATE INDEX idx_sessions_expires ON sessions(expires_at);
      `);

      // A placeholder owner with no password. Whoever opens Pocket first
      // claims this row, which is what hands them the existing library rather
      // than leaving it stranded under a user that never logs in.
      db.prepare(
        `INSERT INTO users (id, username, display_name, password_hash, is_owner)
         VALUES (1, 'owner', '', NULL, 1)`,
      ).run();

      db.exec(`
        CREATE TABLE collections_new (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name         TEXT    NOT NULL,
          description  TEXT,
          color        TEXT,
          position     INTEGER NOT NULL DEFAULT 0,
          created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
          UNIQUE (user_id, name)
        );
        INSERT INTO collections_new (id, user_id, name, description, color, position, created_at)
          SELECT id, 1, name, description, color, position, created_at FROM collections;
        DROP TABLE collections;
        ALTER TABLE collections_new RENAME TO collections;
        CREATE INDEX idx_collections_user ON collections(user_id, position, name);

        CREATE TABLE tags_new (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name       TEXT    NOT NULL COLLATE NOCASE,
          created_at TEXT    NOT NULL DEFAULT (datetime('now')),
          UNIQUE (user_id, name)
        );
        INSERT INTO tags_new (id, user_id, name, created_at)
          SELECT id, 1, name, created_at FROM tags;
        DROP TABLE tags;
        ALTER TABLE tags_new RENAME TO tags;
        CREATE INDEX idx_tags_user ON tags(user_id, name);

        CREATE TABLE bookmarks_new (
          id                  INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          url                 TEXT    NOT NULL,
          normalized_url      TEXT    NOT NULL,
          title               TEXT    NOT NULL DEFAULT '',
          description         TEXT    NOT NULL DEFAULT '',
          site_name           TEXT    NOT NULL DEFAULT '',
          favicon_path        TEXT,
          preview_path        TEXT,
          cover_path          TEXT,
          collection_id       INTEGER REFERENCES collections(id) ON DELETE SET NULL,
          is_pinned           INTEGER NOT NULL DEFAULT 0,
          metadata_status     TEXT    NOT NULL DEFAULT 'pending',
          metadata_error      TEXT,
          metadata_fetched_at TEXT,
          ai_status           TEXT    NOT NULL DEFAULT 'none',
          ai_error            TEXT,
          ai_applied_at       TEXT,
          created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
          updated_at          TEXT    NOT NULL DEFAULT (datetime('now')),
          UNIQUE (user_id, normalized_url)
        );
        INSERT INTO bookmarks_new (id, user_id, url, normalized_url, title, description, site_name,
                                   favicon_path, preview_path, cover_path, collection_id, is_pinned,
                                   metadata_status, metadata_error, metadata_fetched_at,
                                   ai_status, ai_error, ai_applied_at, created_at, updated_at)
          SELECT id, 1, url, normalized_url, title, description, site_name,
                 favicon_path, preview_path, cover_path, collection_id, is_pinned,
                 metadata_status, metadata_error, metadata_fetched_at,
                 ai_status, ai_error, ai_applied_at, created_at, updated_at
            FROM bookmarks;
        DROP TABLE bookmarks;
        ALTER TABLE bookmarks_new RENAME TO bookmarks;

        CREATE INDEX idx_bookmarks_created ON bookmarks(user_id, created_at DESC);
        CREATE INDEX idx_bookmarks_pinned  ON bookmarks(user_id, is_pinned, created_at DESC);
        CREATE INDEX idx_bookmarks_coll    ON bookmarks(collection_id);
        CREATE INDEX idx_bookmarks_status  ON bookmarks(user_id, metadata_status);

        CREATE TABLE settings_new (
          user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          key        TEXT    NOT NULL,
          value      TEXT    NOT NULL,
          updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
          PRIMARY KEY (user_id, key)
        );
        INSERT INTO settings_new (user_id, key, value, updated_at)
          SELECT 1, key, value, updated_at FROM settings;
        DROP TABLE settings;
        ALTER TABLE settings_new RENAME TO settings;
      `);

      // bookmark_tags survives the rebuild untouched because both sides kept
      // their ids, but the index went with the dropped table.
      db.exec(`CREATE INDEX IF NOT EXISTS idx_bookmark_tags_tag ON bookmark_tags(tag_id);`);
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

  const pending = migrations.filter((migration) => !applied.has(migration.id));
  if (pending.length === 0) return;

  /*
   * Rebuilding a table to change a UNIQUE constraint means dropping one that
   * other tables reference, which would cascade rows away with foreign keys
   * enforced. They go off for the migration only, before any request is served,
   * and `foreign_key_check` afterwards refuses to leave a broken database
   * behind rather than trusting the copy went right.
   */
  db.pragma('foreign_keys = OFF');
  try {
    for (const migration of pending) {
      db.transaction(() => {
        migration.up(db);
        record.run(migration.id, migration.name);
      })();
    }

    const violations = db.pragma('foreign_key_check') as unknown[];
    if (violations.length > 0) {
      throw new Error(
        `A Pocket migration left ${violations.length} broken reference(s) behind. The database was not changed further.`,
      );
    }
  } finally {
    db.pragma('foreign_keys = ON');
  }
}
