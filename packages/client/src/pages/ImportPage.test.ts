import { describe, it, expect } from 'vitest';
import {
  SKIP_SENTINEL,
  isAccountResolved,
  filterSkippedAccounts,
  getValidationState,
  computeSkipFilterStats,
} from './ImportPage';

describe('isAccountResolved', () => {
  it('returns true for a real account ID', () => {
    expect(isAccountResolved('acct-123')).toBe(true);
  });

  it('returns true for skip sentinel (skip is resolved)', () => {
    expect(isAccountResolved(SKIP_SENTINEL)).toBe(true);
  });

  it('returns false for empty string (undecided)', () => {
    expect(isAccountResolved('')).toBe(false);
  });
});

describe('filterSkippedAccounts', () => {
  it('removes entries with skip sentinel value', () => {
    const result = filterSkippedAccounts({
      Checking: 'acct-1',
      Savings: SKIP_SENTINEL,
    });
    expect(result).toEqual({ Checking: 'acct-1' });
  });

  it('returns empty object when all accounts are skipped', () => {
    const result = filterSkippedAccounts({
      Checking: SKIP_SENTINEL,
      Savings: SKIP_SENTINEL,
    });
    expect(result).toEqual({});
  });

  it('returns all entries unchanged when none are skipped', () => {
    const input = { Checking: 'acct-1', Savings: 'acct-2' };
    const result = filterSkippedAccounts(input);
    expect(result).toEqual(input);
  });
});

describe('getValidationState', () => {
  it('returns canContinue true when all resolved with at least one real mapping', () => {
    const accounts = [{ csvName: 'Checking' }, { csvName: 'Savings' }];
    const mappings = { Checking: 'acct-1', Savings: SKIP_SENTINEL };
    const result = getValidationState(accounts, mappings);
    expect(result).toEqual({ canContinue: true, message: null });
  });

  it('returns canContinue false with undecided message when some are empty', () => {
    const accounts = [{ csvName: 'Checking' }, { csvName: 'Savings' }];
    const mappings = { Checking: 'acct-1', Savings: '' };
    const result = getValidationState(accounts, mappings);
    expect(result).toEqual({
      canContinue: false,
      message: 'All accounts must be mapped or skipped before continuing',
    });
  });

  it('returns canContinue false with all-skipped message when every account is skipped', () => {
    const accounts = [{ csvName: 'Checking' }, { csvName: 'Savings' }];
    const mappings = { Checking: SKIP_SENTINEL, Savings: SKIP_SENTINEL };
    const result = getValidationState(accounts, mappings);
    expect(result).toEqual({
      canContinue: false,
      message: 'At least one account must be mapped to import',
    });
  });

  it('returns canContinue false with null message when accounts list is empty', () => {
    const result = getValidationState([], {});
    expect(result).toEqual({ canContinue: false, message: null });
  });

  it('treats missing mapping key as undecided', () => {
    const accounts = [{ csvName: 'Checking' }];
    const mappings = {}; // no entry for Checking
    const result = getValidationState(accounts, mappings);
    expect(result).toEqual({
      canContinue: false,
      message: 'All accounts must be mapped or skipped before continuing',
    });
  });

  it('returns canContinue true when all accounts are mapped (none skipped)', () => {
    const accounts = [{ csvName: 'Checking' }, { csvName: 'Savings' }];
    const mappings = { Checking: 'acct-1', Savings: 'acct-2' };
    const result = getValidationState(accounts, mappings);
    expect(result).toEqual({ canContinue: true, message: null });
  });
});

describe('computeSkipFilterStats', () => {
  it('returns empty set and zero count when no accounts are skipped', () => {
    const result = computeSkipFilterStats({}, { Checking: 10 });
    expect(result.skippedAccountNames.size).toBe(0);
    expect(result.skippedRowCount).toBe(0);
  });

  it('identifies skipped accounts and sums their row counts', () => {
    const result = computeSkipFilterStats(
      { Checking: SKIP_SENTINEL, Savings: 'acct-1' },
      { Checking: 10, Savings: 5 }
    );
    expect(result.skippedAccountNames).toEqual(new Set(['Checking']));
    expect(result.skippedRowCount).toBe(10);
  });

  it('sums row counts for multiple skipped accounts', () => {
    const result = computeSkipFilterStats(
      { A: SKIP_SENTINEL, B: SKIP_SENTINEL },
      { A: 3, B: 7 }
    );
    expect(result.skippedAccountNames).toEqual(new Set(['A', 'B']));
    expect(result.skippedRowCount).toBe(10);
  });

  it('handles missing rowCount gracefully (defaults to 0)', () => {
    const result = computeSkipFilterStats(
      { A: SKIP_SENTINEL },
      {}
    );
    expect(result.skippedAccountNames).toEqual(new Set(['A']));
    expect(result.skippedRowCount).toBe(0);
  });

  it('does not treat empty string (undecided) as skipped', () => {
    const result = computeSkipFilterStats(
      { A: '', B: 'acct-1' },
      { A: 5, B: 10 }
    );
    expect(result.skippedAccountNames.size).toBe(0);
    expect(result.skippedRowCount).toBe(0);
  });
});
