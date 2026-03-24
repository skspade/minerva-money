export const MODELS = [
  {
    id: 'claude-haiku-3-5-20241022',
    label: 'Haiku',
    description: 'Fast and lightweight. Best for simple questions and quick lookups.',
  },
  {
    id: 'claude-sonnet-4-20250514',
    label: 'Sonnet',
    description: 'Balanced performance. Best for most tasks including analysis and categorization.',
  },
  {
    id: 'claude-opus-4-20250514',
    label: 'Opus',
    description: 'Most capable. Best for complex reasoning and multi-step tasks.',
  },
] as const;

export type ModelId = (typeof MODELS)[number]['id'];

export const MODEL_IDS = MODELS.map(m => m.id);

export const DEFAULT_MODEL_ID: ModelId = 'claude-sonnet-4-20250514';

export const TIMEOUT_MS: Record<ModelId, number> = {
  'claude-haiku-3-5-20241022': 15_000,
  'claude-sonnet-4-20250514': 30_000,
  'claude-opus-4-20250514': 60_000,
};

export function isValidModelId(id: string): id is ModelId {
  return MODEL_IDS.includes(id as ModelId);
}
