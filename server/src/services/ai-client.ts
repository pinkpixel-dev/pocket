import { config } from '../config.js';
import { HttpError } from '../lib/errors.js';
import { FetchError, postJson } from '../lib/http.js';
import { findModel } from '../lib/ai-models.js';
import { readAiConfig } from './settings.js';

/**
 * A failure that came from the AI side rather than from Pocket. 502 keeps it
 * out of the generic "something went wrong" bucket, so the dialog can show
 * what OpenAI actually said.
 */
export class AiRequestError extends HttpError {
  constructor(message: string) {
    super(502, message);
    this.name = 'AiRequestError';
  }
}

function readOutputText(payload: unknown): string {
  const response = payload as {
    output_text?: string;
    output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
  };

  if (typeof response.output_text === 'string' && response.output_text) return response.output_text;

  for (const item of response.output ?? []) {
    if (item.type !== 'message') continue;
    for (const part of item.content ?? []) {
      if (part.type === 'output_text' && part.text) return part.text;
    }
  }
  return '';
}

export interface AiJsonRequest {
  instructions: string;
  input: string;
  /** Names the JSON schema in the request. Letters and underscores only. */
  schemaName: string;
  schema: unknown;
}

/**
 * One structured-output call to the Responses API. Every organizing feature
 * goes through here, so they all fail the same way and none of them can
 * quietly send the key somewhere else.
 */
export async function callAiJson<T>(request: AiJsonRequest): Promise<T> {
  const ai = readAiConfig();
  if (!ai.apiKey) throw new AiRequestError('No OpenAI API key is configured.');

  const model = findModel(ai.model);
  if (!model) throw new AiRequestError(`Pocket does not know the model "${ai.model}".`);

  let result;
  try {
    result = await postJson(
      `${config.openai.baseUrl}/responses`,
      {
        model: ai.model,
        instructions: request.instructions,
        input: request.input,
        reasoning: { effort: ai.reasoningEffort },
        store: false,
        text: {
          format: {
            type: 'json_schema',
            name: request.schemaName,
            strict: true,
            schema: request.schema,
          },
        },
      },
      { authorization: `Bearer ${ai.apiKey}` },
    );
  } catch (error) {
    throw new AiRequestError(
      error instanceof FetchError ? error.message : 'The OpenAI request failed.',
    );
  }

  if (result.status >= 400) {
    const detail = (result.body as { error?: { message?: string } } | null)?.error?.message;
    throw new AiRequestError(detail || `OpenAI answered with HTTP ${result.status}.`);
  }

  const text = readOutputText(result.body);
  if (!text) throw new AiRequestError('OpenAI returned an empty answer.');

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AiRequestError('The OpenAI response could not be read as JSON.');
  }
}
