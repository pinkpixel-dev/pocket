import Database from 'better-sqlite3';
import { config, ensureDataDirs } from '../config.js';
import { migrate } from './schema.js';

ensureDataDirs();

export const db = new Database(config.dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');
db.pragma('busy_timeout = 5000');

migrate(db);

export function closeDatabase(): void {
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
  } finally {
    db.close();
  }
}
