import { describe, it, expect } from 'vitest';
import { parsePayee, formatShortDate } from './format';

describe('parsePayee', () => {
  it('strips ACH Withdrawal prefix', () => {
    expect(parsePayee('ACH Withdrawal GLAMSTAR LIMITED')).toEqual({
      displayName: 'GLAMSTAR LIMITED',
      prefix: 'ACH Withdrawal',
    });
  });

  it('strips Point Of Sale Withdrawal prefix', () => {
    expect(parsePayee('Point Of Sale Withdrawal THE WORKS')).toEqual({
      displayName: 'THE WORKS',
      prefix: 'Point Of Sale Withdrawal',
    });
  });

  it('strips External Deposit prefix', () => {
    expect(parsePayee('External Deposit C101579 PANORAMA')).toEqual({
      displayName: 'C101579 PANORAMA',
      prefix: 'External Deposit',
    });
  });

  it('strips ACH Deposit prefix', () => {
    expect(parsePayee('ACH Deposit PAYROLL From COMPANY')).toEqual({
      displayName: 'PAYROLL From COMPANY',
      prefix: 'ACH Deposit',
    });
  });

  it('returns full payee when prefix IS the entire name', () => {
    expect(parsePayee('Credit Interest')).toEqual({
      displayName: 'Credit Interest',
      prefix: null,
    });
  });

  it('returns full payee when ACH Withdrawal is the entire name', () => {
    expect(parsePayee('ACH Withdrawal')).toEqual({
      displayName: 'ACH Withdrawal',
      prefix: null,
    });
  });

  it('returns full payee when no prefix matches', () => {
    expect(parsePayee('AMAZON.COM')).toEqual({
      displayName: 'AMAZON.COM',
      prefix: null,
    });
  });

  it('handles manual transaction payees', () => {
    expect(parsePayee('My Coffee Shop')).toEqual({
      displayName: 'My Coffee Shop',
      prefix: null,
    });
  });

  it('handles empty string', () => {
    expect(parsePayee('')).toEqual({
      displayName: '',
      prefix: null,
    });
  });

  it('matches prefixes case-insensitively', () => {
    expect(parsePayee('ACH WITHDRAWAL GLAMSTAR LIMITED')).toEqual({
      displayName: 'GLAMSTAR LIMITED',
      prefix: 'ACH WITHDRAWAL',
    });
  });
});

describe('formatShortDate', () => {
  it('formats date as M/D', () => {
    expect(formatShortDate('2026-03-31')).toBe('3/31');
  });

  it('formats single-digit month and day', () => {
    expect(formatShortDate('2026-01-05')).toBe('1/5');
  });

  it('formats December 25', () => {
    expect(formatShortDate('2026-12-25')).toBe('12/25');
  });
});
