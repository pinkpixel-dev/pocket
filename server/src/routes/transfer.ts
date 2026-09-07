import { Router } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { badRequest } from '../lib/errors.js';
import {
  buildBookmarkHtml,
  buildJsonBackup,
  importLinks,
  linksFromBackup,
  parseBookmarkHtml,
} from '../services/transfer.js';

export const transferRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
});

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

transferRouter.get('/export/html', (_req, res) => {
  res
    .type('text/html; charset=utf-8')
    .setHeader('content-disposition', `attachment; filename="pocket-bookmarks-${stamp()}.html"`);
  res.send(buildBookmarkHtml());
});

transferRouter.get('/export/json', (_req, res) => {
  res
    .type('application/json; charset=utf-8')
    .setHeader('content-disposition', `attachment; filename="pocket-backup-${stamp()}.json"`);
  res.send(JSON.stringify(buildJsonBackup(), null, 2));
});

/** Accepts either a browser export or a Pocket JSON backup, sniffed by content. */
transferRouter.post('/import', upload.single('file'), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) throw badRequest('Choose a bookmarks file to import.');

    const text = file.buffer.toString('utf8');
    const trimmed = text.trimStart();
    const fetchMetadata = req.body?.fetchMetadata !== 'false';
    const skipDeadLinks = req.body?.skipDeadLinks === 'true' || req.body?.skipDeadLinks === true;
    const yearParsed = req.body?.yearFilter ? parseInt(String(req.body.yearFilter), 10) : undefined;
    const yearFilter = Number.isFinite(yearParsed) ? yearParsed : undefined;
    const yearMode =
      req.body?.yearMode === 'since' || req.body?.yearMode === 'before' ? req.body.yearMode : 'exact';
    const rawStrategy = req.body?.folderStrategy;
    const folderStrategy = (rawStrategy === 'tags_only' || rawStrategy === 'innermost' ? rawStrategy : 'hierarchy') as
      | 'hierarchy'
      | 'tags_only'
      | 'innermost';
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

    const summary = await importLinks(links, {
      fetchMetadata,
      skipDeadLinks,
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

