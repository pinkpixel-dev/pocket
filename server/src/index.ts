import fs from 'node:fs';
import path from 'node:path';
import express, { type ErrorRequestHandler } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { config, ensureDataDirs } from './config.js';
import { closeDatabase } from './db/index.js';
import { HttpError } from './lib/errors.js';
import { attachUser, requireAuth } from './middleware/auth.js';
import { authRouter } from './routes/auth.js';
import { bookmarksRouter } from './routes/bookmarks.js';
import { libraryRouter } from './routes/library.js';
import { settingsRouter } from './routes/settings.js';
import { transferRouter } from './routes/transfer.js';
import { resumePendingJobs } from './services/queue.js';
import { sweepExpiredSessions } from './services/sessions.js';

ensureDataDirs();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

/*
 * Resolves the session cookie once, before anything that cares who is asking.
 * Scoped to the two prefixes that do, so serving the frontend's own JavaScript
 * does not cost a database lookup per file.
 */
app.use(['/api', '/media'], attachUser);

/** Deliberately open, so a NAS health check does not need an account. */
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: process.env.npm_package_version ?? '0.1.0' });
});

app.use('/api', authRouter);
app.use('/api/bookmarks', bookmarksRouter);
app.use('/api', libraryRouter);
app.use('/api', settingsRouter);
app.use('/api', transferRouter);

/**
 * Cached previews are content-addressed, so they never change under a given
 * name. Locking them down matters because the bytes came from the open web.
 *
 * Signing in is required, but not ownership of the bookmark behind the file:
 * the names are content hashes, so two accounts that saved the same page share
 * one file, and knowing a name already means having the bytes.
 */
app.use(
  '/media',
  requireAuth,
  express.static(config.dataDir, {
    index: false,
    dotfiles: 'deny',
    maxAge: '365d',
    immutable: true,
    setHeaders: (res) => {
      res.setHeader('x-content-type-options', 'nosniff');
      res.setHeader('content-security-policy', "default-src 'none'; sandbox");
      res.setHeader('cross-origin-resource-policy', 'same-origin');
    },
  }),
);

const indexHtml = path.join(config.clientDir, 'index.html');
const hasClientBuild = fs.existsSync(indexHtml);

if (hasClientBuild) {
  app.use(
    express.static(config.clientDir, {
      index: false,
      maxAge: '30d',
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) res.setHeader('cache-control', 'no-cache');
      },
    }),
  );
}

app.use((req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/media')) {
    next();
    return;
  }
  if (!hasClientBuild) {
    res
      .status(503)
      .type('text/plain')
      .send('The Pocket frontend has not been built yet. Run `npm run build` first.');
    return;
  }
  res.setHeader('cache-control', 'no-cache');
  res.sendFile(indexHtml);
});

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message, details: error.details ?? undefined });
    return;
  }
  if (error instanceof ZodError) {
    res.status(400).json({ error: error.issues[0]?.message ?? 'That request could not be understood.' });
    return;
  }
  if (error instanceof multer.MulterError) {
    const message =
      error.code === 'LIMIT_FILE_SIZE'
        ? `That file is larger than the ${Math.round(config.maxUploadBytes / 1024 / 1024)} MB import limit.`
        : 'That upload could not be read.';
    res.status(400).json({ error: message });
    return;
  }

  console.error('[pocket] unhandled error:', error);
  res.status(500).json({ error: 'Something went wrong on the server.' });
};

app.use(errorHandler);

const server = app.listen(config.port, config.host, () => {
  console.log(`[pocket] listening on http://${config.host}:${config.port}`);
  console.log(`[pocket] data directory: ${config.dataDir}`);
  const resumed = resumePendingJobs();
  if (resumed > 0) console.log(`[pocket] resuming metadata for ${resumed} bookmark(s)`);
  sweepExpiredSessions();
});

// Expired sessions are also dropped when one is used, so this is only here to
// keep the table from growing on behalf of devices that never come back.
const sessionSweep = setInterval(() => {
  try {
    sweepExpiredSessions();
  } catch (error) {
    console.error('[pocket] could not sweep expired sessions:', error);
  }
}, 6 * 60 * 60 * 1000);
sessionSweep.unref();

function shutdown(signal: string): void {
  console.log(`[pocket] ${signal} received, shutting down`);
  server.close(() => {
    closeDatabase();
    process.exit(0);
  });
  // Do not let a hung connection keep the container alive forever.
  setTimeout(() => process.exit(0), 8_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
