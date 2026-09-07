import { Router } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { badRequest } from '../lib/errors.js';
import { requireAuth, userIdOf } from '../middleware/auth.js';
import {
  buildBookmarkHtml,
  buildJsonBackup,
  importLinks,
  linksFromBackup,
  parseBookmarkHtml,
} from '../services/transfer.js';

export const transferRouter = Router();

transferRouter.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
});

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

transferRouter.get('/export/html', (req, res) => {
  res
    .type('text/html; charset=utf-8')
    .setHeader('content-disposition', `attachment; filename="pocket-bookmarks-${stamp()}.html"`);
  res.send(buildBookmarkHtml(userIdOf(req)));
});

transferRouter.get('/export/json', (req, res) => {
  res
    .type('application/json; charset=utf-8')
    .setHeader('content-disposition', `attachment; filename="pocket-backup-${stamp()}.json"`);
  res.send(JSON.stringify(buildJsonBackup(userIdOf(req)), null, 2));
});

/** Accepts either a browser export or a Pocket JSON backup, sniffed by content. */
transferRouter.post('/import', upload.single('file'), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) throw badRequest('Choose a bookmarks file to import.');

    const text = file.buffer.toString('utf8');
    const trimmed = text.trimStart();
    const fetchMetadata = req.body?.fetchMetadata !== 'false';
    // An older client still sends the retired "skipDeadLinks" name for what is
    // now a check that runs after the import rather than a filter before it.
    const rawCheck = req.body?.checkLinks ?? req.body?.skipDeadLinks;
    const checkLinks = rawCheck === 'true' || rawCheck === true;
    const yearParsed = req.body?.yearFilter ? parseInt(String(req.body.yearFilter), 10) : undefined;
    const yearFilter = Number.isFinite(yearParsed) ? yearParsed : undefined;
    const yearMode =
      req.body?.yearMode === 'since' || req.body?.yearMode === 'before' ? req.body.yearMode : 'exact';
    const rawStrategy = req.body?.folderStrategy;
    // An older client can still send the retired "innermost" strategy, which
    // falls back to the hierarchy default rather than failing the import.
    const folderStrategy = (rawStrategy === 'tags_only' ? rawStrategy : 'hierarchy') as
      | 'hierarchy'
      | 'tags_only';
    const defaultCollection =
      typeof req.body?.defaultCollection === 'string' && req.body.defaultCollection.trim()
        ? req.body.defaultCollection.trim()
        : undefined;

    let links;
    if (trimmed.startsWith('{')) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw badRequest('That JSON file could not be read.');
      }
      links = linksFromBackup(parsed);
      if (links.length === 0) throw badRequest('That JSON file does not contain any Pocket bookmarks.');
    } else {
      links = parseBookmarkHtml(text);
      if (links.length === 0) throw badRequest('No bookmarks were found in that file.');
    }

    const summary = await importLinks(userIdOf(req), links, {
      fetchMetadata,
      checkLinks,
      yearFilter,
      yearMode,
      folderStrategy,
      defaultCollection,
    });

    res.json({ summary });
  } catch (error) {
    next(error);
  }
});

