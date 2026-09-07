/**
 * The models Pocket will talk to, and the reasoning efforts each one accepts.
 * OpenAI rejects an effort a model does not support, so the list is validated
 * here rather than discovered at request time.
 */
export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

const EFFORTS_56: ReasoningEffort[] = ['none', 'low', 'medium', 'high', 'xhigh', 'max'];
const EFFORTS_55: ReasoningEffort[] = ['none', 'low', 'medium', 'high', 'xhigh'];
const EFFORTS_51: ReasoningEffort[] = ['none', 'low', 'medium', 'high'];
const EFFORTS_50: ReasoningEffort[] = ['minimal', 'low', 'medium', 'high'];

export interface AiModel {
  id: string;
  /** Shown under the name in Settings. Prices are per million tokens. */
  note: string;
  efforts: ReasoningEffort[];
}

export const AI_MODELS: AiModel[] = [
  { id: 'gpt-5-nano', note: 'Cheapest of all. $0.05 in / $0.40 out.', efforts: EFFORTS_50 },
  { id: 'gpt-5.4-nano', note: 'The default. Newer and noticeably better at this for very little. $0.20 in / $1.25 out.', efforts: EFFORTS_55 },
  { id: 'gpt-5-mini', note: '$0.25 in / $2.00 out.', efforts: EFFORTS_50 },
  { id: 'gpt-5.4-mini', note: '$0.75 in / $4.50 out.', efforts: EFFORTS_55 },
  { id: 'gpt-5', note: '$1.25 in / $10.00 out.', efforts: EFFORTS_50 },
  { id: 'gpt-5.1', note: '$1.25 in / $10.00 out.', efforts: EFFORTS_51 },
  { id: 'gpt-5.2', note: '$1.75 in / $14.00 out.', efforts: EFFORTS_55 },
  { id: 'gpt-5.4', note: '$2.50 in / $15.00 out.', efforts: EFFORTS_55 },
  { id: 'gpt-5.5', note: 'Far more than this job needs.', efforts: EFFORTS_55 },
  { id: 'gpt-5.6-luna', note: 'Far more than this job needs.', efforts: EFFORTS_56 },
  { id: 'gpt-5.6-terra', note: 'Far more than this job needs.', efforts: EFFORTS_56 },
  { id: 'gpt-5.6-sol', note: 'Far more than this job needs.', efforts: EFFORTS_56 },
];

export const DEFAULT_MODEL = 'gpt-5.4-nano';
export const DEFAULT_EFFORT: ReasoningEffort = 'low';

export function findModel(id: string): AiModel | undefined {
  return AI_MODELS.find((model) => model.id === id);
}

/** Falls back to the closest effort the model actually offers. */
export function coerceEffort(model: AiModel, effort: string): ReasoningEffort {
  if ((model.efforts as string[]).includes(effort)) return effort as ReasoningEffort;
  if (model.efforts.includes('low')) return 'low';
  return model.efforts[0]!;
}
