export const MODELS = [
  {
    id: 'claude-haiku-4-5',
    label: 'Haiku',
    description: 'Fast and lightweight. Best for simple questions and quick lookups.',
  },
  {
    id: 'claude-sonnet-4-5',
    label: 'Sonnet',
    description: 'Balanced performance. Best for most tasks including analysis and categorization.',
  },
  {
    id: 'claude-opus-4',
    label: 'Opus',
    description: 'Most capable. Best for complex reasoning and multi-step tasks.',
  },
] as const;

export type ModelId = (typeof MODELS)[number]['id'];

export const MODEL_IDS = MODELS.map(m => m.id);

export const DEFAULT_MODEL_ID: ModelId = 'claude-sonnet-4-5';

export const TIMEOUT_MS: Record<ModelId, number> = {
  'claude-haiku-4-5': 15_000,
  'claude-sonnet-4-5': 30_000,
  'claude-opus-4': 60_000,
};

export function isValidModelId(id: string): id is ModelId {
  return MODEL_IDS.includes(id as ModelId);
}
