import { describe, it, expect } from 'vitest';
import { app } from './index.js';

describe('Express server', () => {
  it('creates an express app', () => {
    expect(app).toBeDefined();
    expect(typeof app.listen).toBe('function');
  });
});
