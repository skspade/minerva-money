import { describe, it, expect } from 'vitest';
import { MODELS, MODEL_IDS, DEFAULT_MODEL_ID, TIMEOUT_MS, isValidModelId } from './models.js';

describe('models', () => {
  it('MODELS contains exactly 3 entries', () => {
    expect(MODELS).toHaveLength(3);
  });

  it('each model has id, label, and description', () => {
    for (const model of MODELS) {
      expect(typeof model.id).toBe('string');
      expect(typeof model.label).toBe('string');
      expect(typeof model.description).toBe('string');
      expect(model.id.length).toBeGreaterThan(0);
      expect(model.label.length).toBeGreaterThan(0);
      expect(model.description.length).toBeGreaterThan(0);
    }
  });

  it('MODELS contains Haiku, Sonnet, and Opus', () => {
    const labels = MODELS.map(m => m.label);
    expect(labels).toEqual(['Haiku', 'Sonnet', 'Opus']);
  });

  it('MODEL_IDS contains exactly the 3 model ID strings', () => {
    expect(MODEL_IDS).toHaveLength(3);
    expect(MODEL_IDS).toContain('claude-haiku-4-5');
    expect(MODEL_IDS).toContain('claude-sonnet-4-6');
    expect(MODEL_IDS).toContain('claude-opus-4-6');
  });

  it('DEFAULT_MODEL_ID equals the Sonnet model ID', () => {
    expect(DEFAULT_MODEL_ID).toBe('claude-sonnet-4-6');
  });

  it('TIMEOUT_MS maps Haiku to 15000, Sonnet to 30000, Opus to 60000', () => {
    expect(TIMEOUT_MS['claude-haiku-4-5']).toBe(15_000);
    expect(TIMEOUT_MS['claude-sonnet-4-6']).toBe(30_000);
    expect(TIMEOUT_MS['claude-opus-4-6']).toBe(60_000);
  });

  it('TIMEOUT_MS has an entry for every model in MODELS', () => {
    for (const model of MODELS) {
      expect(TIMEOUT_MS).toHaveProperty(model.id);
      expect(typeof TIMEOUT_MS[model.id]).toBe('number');
      expect(TIMEOUT_MS[model.id]).toBeGreaterThan(0);
    }
  });

  it('MODEL_IDS includes every model id from MODELS', () => {
    for (const model of MODELS) {
      expect(MODEL_IDS).toContain(model.id);
    }
  });

  describe('isValidModelId', () => {
    it('returns true for valid model IDs', () => {
      expect(isValidModelId('claude-haiku-4-5')).toBe(true);
      expect(isValidModelId('claude-sonnet-4-6')).toBe(true);
      expect(isValidModelId('claude-opus-4-6')).toBe(true);
    });

    it('returns false for invalid model IDs', () => {
      expect(isValidModelId('invalid-model')).toBe(false);
      expect(isValidModelId('')).toBe(false);
      expect(isValidModelId('claude-sonnet-3')).toBe(false);
    });
  });
});
