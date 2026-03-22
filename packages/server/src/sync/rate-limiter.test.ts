import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRateLimiter } from './rate-limiter.js';

describe('createRateLimiter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('new account has full remaining requests', () => {
    const limiter = createRateLimiter(20, 4);
    expect(limiter.remainingRequests('acct-1')).toBe(20);
  });

  it('canRequest returns true when under limit', () => {
    const limiter = createRateLimiter(20, 4);
    expect(limiter.canRequest('acct-1')).toBe(true);
  });

  it('increment reduces remaining count', () => {
    const limiter = createRateLimiter(20, 4);
    limiter.increment('acct-1');
    expect(limiter.remainingRequests('acct-1')).toBe(19);
  });

  it('canRequest returns false at limit', () => {
    const limiter = createRateLimiter(3, 1);
    limiter.increment('acct-1');
    limiter.increment('acct-1');
    limiter.increment('acct-1');
    expect(limiter.canRequest('acct-1')).toBe(false);
  });

  it('canManualSync returns true when enough requests remain', () => {
    const limiter = createRateLimiter(20, 4);
    expect(limiter.canManualSync('acct-1')).toBe(true);
  });

  it('canManualSync returns false when fewer than reserve remain', () => {
    const limiter = createRateLimiter(5, 4);
    limiter.increment('acct-1');
    limiter.increment('acct-1');
    // 3 remaining, but need 4 for manual
    expect(limiter.canManualSync('acct-1')).toBe(false);
  });

  it('tracks accounts independently', () => {
    const limiter = createRateLimiter(20, 4);
    limiter.increment('acct-1');
    limiter.increment('acct-1');
    limiter.increment('acct-2');
    expect(limiter.remainingRequests('acct-1')).toBe(18);
    expect(limiter.remainingRequests('acct-2')).toBe(19);
  });

  it('resets count when date changes', () => {
    const limiter = createRateLimiter(20, 4);
    limiter.increment('acct-1');
    expect(limiter.remainingRequests('acct-1')).toBe(19);

    // Simulate date change by mocking Date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    vi.setSystemTime(tomorrow);

    expect(limiter.remainingRequests('acct-1')).toBe(20);
    expect(limiter.canRequest('acct-1')).toBe(true);
  });
});
