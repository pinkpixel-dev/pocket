import { Router } from 'express';
import { z } from 'zod';
import { publicAiSettings, readAiConfig, updateAiSettings } from '../services/settings.js';
import { badRequest } from '../lib/errors.js';

export const settingsRouter = Router();

const aiSchema = z.object({
  apiKey: z.string().max(400).optional(),
  model: z.string().max(80).optional(),
  reasoningEffort: z.enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']).optional(),
  autoRun: z.boolean().optional(),
  createCollections: z.boolean().optional(),
});

settingsRouter.get('/settings', (_req, res) => {
  res.json({ ai: publicAiSettings() });
});

settingsRouter.patch('/settings/ai', (req, res) => {
  const result = aiSchema.safeParse(req.body);
  if (!result.success) {
    throw badRequest(result.error.issues[0]?.message ?? 'Those settings could not be understood.');
  }

  // The environment is the operator's decision and the browser cannot override it.
  if (result.data.apiKey !== undefined && readAiConfig().keySource === 'env') {
    throw badRequest('The key comes from POCKET_OPENAI_API_KEY. Change it there instead.');
  }

  res.json({ ai: updateAiSettings(result.data) });
});
