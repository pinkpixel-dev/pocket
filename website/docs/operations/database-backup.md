---
id: database-backup
title: Database & Backups
---

# Database & Backups

Pocket stores all data inside a single SQLite database file configured with Write-Ahead Logging (WAL) and synchronous durability pragmas.

## The data directory structure

Your bind-mounted `data/` directory contains:

```text
data/
├── pocket.db          Primary database file containing users, bookmarks, tags, and settings
├── pocket.db-wal      Write-Ahead Log (active while container is running)
├── pocket.db-shm      Shared memory index for concurrent reads (active while running)
├── previews/          Locally cached website Open Graph preview images
├── favicons/          Locally cached website favicons
└── covers/            Custom cover images uploaded or pasted by users
```

:::warning Custom covers are irreplaceable
If you lose `previews/` or `favicons/`, Pocket can rebuild them automatically by running a metadata refresh on your bookmarks. However, `covers/` contains user-uploaded images that cannot be re-fetched from the internet. Always back up `covers/` along with `pocket.db`.
:::

## Method 1: Clean offline backup (Recommended)

Stopping the container ensures SQLite checkpoints the write-ahead log cleanly back into `pocket.db`:

```bash
# 1. Stop the container
docker compose stop

# 2. Archive the data directory
tar -czf pocket-backup-$(date +%F).tar.gz data/

# 3. Restart Pocket
docker compose start
```

This archive contains your complete database, custom covers, and preview caches.

## Method 2: Live online backup

If you cannot stop the container, you can use the SQLite online backup API via Node to generate a consistent snapshot of `pocket.db`:

```bash
docker compose exec pocket node -e "
const db = require('better-sqlite3')('/data/pocket.db');
db.backup('/data/pocket-backup.db')
  .then(() => {
    console.log('Live backup completed.');
    db.close();
  })
  .catch(err => {
    console.error('Backup failed:', err);
    process.exit(1);
  });
"
```

After generating `pocket-backup.db`, copy it and your `data/covers/` folder to your backup storage.

## Restoring from a backup

To restore Pocket on a new machine or recover after disk replacement:

```bash
# 1. Stop and remove current container
docker compose down

# 2. Extract your backup archive into data/
tar -xzf pocket-backup-2026-09-07.tar.gz

# 3. Ensure permissions match the node user (UID 1000)
sudo chown -R 1000:1000 data/

# 4. Start the container
docker compose up -d
```

## JSON exports for platform independence

If you prefer a plain text backup that does not depend on SQLite binaries, navigate to **Settings > Transfer** and click **Export library as JSON**. This export includes all your URLs, titles, custom tags, collection structures, and creation timestamps in a standard format.
