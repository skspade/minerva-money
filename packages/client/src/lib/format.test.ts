import { describe, it, expect } from 'vitest';
import { parsePayee, formatShortDate, formatRelativeDate } from './format';

describe('parsePayee', () => {
  it('strips ACH Withdrawal prefix', () => {
    expect(parsePayee('ACH Withdrawal GLAMSTAR LIMITED')).toEqual({
      displayName: 'Glamstar Limited',
      rawDisplayName: 'GLAMSTAR LIMITED',
      prefix: 'ACH Withdrawal',
    });
  });

  it('strips Point Of Sale Withdrawal prefix', () => {
    expect(parsePayee('Point Of Sale Withdrawal THE WORKS')).toEqual({
      displayName: 'The Works',
      rawDisplayName: 'THE WORKS',
      prefix: 'Point Of Sale Withdrawal',
    });
  });

  it('strips External Deposit prefix', () => {
    expect(parsePayee('External Deposit C101579 PANORAMA')).toEqual({
      displayName: 'C101579 Panorama',
      rawDisplayName: 'C101579 PANORAMA',
      prefix: 'External Deposit',
    });
  });

  it('strips ACH Deposit prefix', () => {
    expect(parsePayee('ACH Deposit PAYROLL From COMPANY')).toEqual({
      displayName: 'PAYROLL From COMPANY',
      rawDisplayName: 'PAYROLL From COMPANY',
      prefix: 'ACH Deposit',
    });
  });

  it('returns full payee when prefix IS the entire name', () => {
    expect(parsePayee('Credit Interest')).toEqual({
      displayName: 'Credit Interest',
      rawDisplayName: 'Credit Interest',
      prefix: null,
    });
  });

  it('returns full payee when ACH Withdrawal is the entire name', () => {
    expect(parsePayee('ACH Withdrawal')).toEqual({
      displayName: 'ACH Withdrawal',
      rawDisplayName: 'ACH Withdrawal',
      prefix: null,
    });
  });

  it('returns full payee when no prefix matches', () => {
    expect(parsePayee('AMAZON.COM')).toEqual({
      displayName: 'Amazon.com',
      rawDisplayName: 'AMAZON.COM',
      prefix: null,
    });
  });

  it('handles manual transaction payees', () => {
    expect(parsePayee('My Coffee Shop')).toEqual({
      displayName: 'My Coffee Shop',
      rawDisplayName: 'My Coffee Shop',
      prefix: null,
    });
  });

  it('handles empty string', () => {
    expect(parsePayee('')).toEqual({
      displayName: '',
      rawDisplayName: '',
      prefix: null,
    });
  });

  it('matches prefixes case-insensitively', () => {
    expect(parsePayee('ACH WITHDRAWAL GLAMSTAR LIMITED')).toEqual({
      displayName: 'Glamstar Limited',
      rawDisplayName: 'GLAMSTAR LIMITED',
      prefix: 'ACH WITHDRAWAL',
    });
  });

  it('strips IC* merchant prefix', () => {
    expect(parsePayee('IC*INSTACART DELIVERY')).toEqual({
      displayName: 'Instacart Delivery',
      rawDisplayName: 'IC*INSTACART DELIVERY',
      prefix: null,
    });
  });

  it('strips SQ* merchant prefix', () => {
    expect(parsePayee('SQ *BLUE BOTTLE COFFEE')).toEqual({
      displayName: 'Blue Bottle Coffee',
      rawDisplayName: 'SQ *BLUE BOTTLE COFFEE',
      prefix: null,
    });
  });

  it('strips phone numbers', () => {
    expect(parsePayee('CHEWY.COM 800-672-4399 FLUS')).toEqual({
      displayName: 'Chewy.com Flus',
      rawDisplayName: 'CHEWY.COM 800-672-4399 FLUS',
      prefix: null,
    });
  });

  it('strips trailing store IDs', () => {
    expect(parsePayee('WHOLEFDS MKT #12345')).toEqual({
      displayName: 'Wholefds Mkt',
      rawDisplayName: 'WHOLEFDS MKT #12345',
      prefix: null,
    });
  });

  it('strips both banking prefix and merchant junk', () => {
    const result = parsePayee('Point Of Sale Withdrawal IC*INSTACART*161 INSTACART.COM');
    expect(result.prefix).toBe('Point Of Sale Withdrawal');
    expect(result.displayName).toBe('Instacart.com');
    expect(result.rawDisplayName).toBe('IC*INSTACART*161 INSTACART.COM');
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

describe('formatRelativeDate', () => {
  function isoDate(daysAgo: number): string {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().slice(0, 10);
  }

  it('returns "Today" for today', () => {
    expect(formatRelativeDate(isoDate(0))).toBe('Today');
  });

  it('returns "Yesterday" for yesterday', () => {
    expect(formatRelativeDate(isoDate(1))).toBe('Yesterday');
  });

  it('returns weekday name for 2-6 days ago', () => {
    const result = formatRelativeDate(isoDate(3));
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    expect(weekdays).toContain(result);
  });

  it('returns short date format for 7+ days ago', () => {
    const result = formatRelativeDate(isoDate(14));
    expect(result).toMatch(/^\w{3}, \w{3} \d{1,2}$/);
  });
});
