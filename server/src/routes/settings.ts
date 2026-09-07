import { Router } from 'express';
import { z } from 'zod';
import { publicAiSettings, updateAiSettings } from '../services/settings.js';
import { badRequest } from '../lib/errors.js';
import { requireAuth, userIdOf } from '../middleware/auth.js';

export const settingsRouter = Router();

settingsRouter.use(requireAuth);

const aiSchema = z.object({
  apiKey: z.string().max(400).optional(),
  model: z.string().max(80).optional(),
  reasoningEffort: z.enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']).optional(),
  autoRun: z.boolean().optional(),
  createCollections: z.boolean().optional(),
});

settingsRouter.get('/settings', (req, res) => {
  res.json({ ai: publicAiSettings(userIdOf(req)) });
});

settingsRouter.patch('/settings/ai', (req, res) => {
  const userId = userIdOf(req);
  const result = aiSchema.safeParse(req.body);
  if (!result.success) {
    throw badRequest(result.error.issues[0]?.message ?? 'Those settings could not be understood.');
  }

  res.json({ ai: updateAiSettings(userId, result.data) });
});
