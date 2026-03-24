import { describe, it, expect } from 'vitest';
import { parseCsv, parseDate, validateRow, transformRow } from './import-service.js';

describe('parseDate', () => {
  it('passes through ISO format YYYY-MM-DD', () => {
    expect(parseDate('2024-01-15')).toBe('2024-01-15');
  });

  it('parses US short format M/D/YYYY', () => {
    expect(parseDate('1/5/2024')).toBe('2024-01-05');
  });

  it('parses US padded format MM/DD/YYYY', () => {
    expect(parseDate('01/05/2024')).toBe('2024-01-05');
  });

  it('parses US end of year', () => {
    expect(parseDate('12/31/2023')).toBe('2023-12-31');
  });

  it('returns null for unparseable date', () => {
    expect(parseDate('not-a-date')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseDate('')).toBeNull();
  });

  it('returns null for whitespace', () => {
    expect(parseDate('   ')).toBeNull();
  });
});

describe('parseCsv', () => {
  const MONARCH_HEADER = 'Date,Merchant,Category,Account,Original Statement,Notes,Amount,Tags';

  it('parses comma-delimited CSV with Monarch columns', () => {
    const csv = `${MONARCH_HEADER}\n2024-01-15,Coffee Shop,Food & Drink,Checking,COFFEE SHOP 123,morning coffee,-4.50,`;
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].Date).toBe('2024-01-15');
    expect(rows[0].Merchant).toBe('Coffee Shop');
    expect(rows[0].Category).toBe('Food & Drink');
    expect(rows[0].Account).toBe('Checking');
    expect(rows[0]['Original Statement']).toBe('COFFEE SHOP 123');
    expect(rows[0].Notes).toBe('morning coffee');
    expect(rows[0].Amount).toBe('-4.50');
  });

  it('parses tab-delimited CSV', () => {
    const csv = `Date\tMerchant\tCategory\tAccount\tOriginal Statement\tNotes\tAmount\tTags\n2024-01-15\tCoffee Shop\tFood & Drink\tChecking\tCOFFEE SHOP 123\t\t-4.50\t`;
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].Merchant).toBe('Coffee Shop');
  });

  it('strips UTF-8 BOM', () => {
    const csv = `\uFEFF${MONARCH_HEADER}\n2024-01-15,Coffee Shop,Food & Drink,Checking,COFFEE SHOP 123,,-4.50,`;
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].Date).toBe('2024-01-15');
  });

  it('handles CRLF line endings', () => {
    const csv = `${MONARCH_HEADER}\r\n2024-01-15,Coffee Shop,Food & Drink,Checking,COFFEE SHOP 123,,-4.50,\r\n`;
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(1);
  });

  it('skips empty lines', () => {
    const csv = `${MONARCH_HEADER}\n\n2024-01-15,Coffee Shop,Food & Drink,Checking,COFFEE SHOP 123,,-4.50,\n\n`;
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(1);
  });

  it('trims field values', () => {
    const csv = `${MONARCH_HEADER}\n 2024-01-15 , Coffee Shop , Food & Drink , Checking , COFFEE SHOP 123 , , -4.50 ,`;
    const rows = parseCsv(csv);
    expect(rows[0].Date).toBe('2024-01-15');
    expect(rows[0].Merchant).toBe('Coffee Shop');
  });

  it('throws error when required columns are missing', () => {
    const csv = 'Date,Merchant,Amount\n2024-01-15,Coffee Shop,-4.50';
    expect(() => parseCsv(csv)).toThrow(/missing required columns/i);
  });

  it('parses multiple rows', () => {
    const csv = `${MONARCH_HEADER}\n2024-01-15,Coffee Shop,Food & Drink,Checking,COFFEE SHOP 123,,-4.50,\n2024-01-16,Gas Station,Auto,Checking,GAS STATION 456,,-35.00,`;
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(2);
  });
});

describe('validateRow', () => {
  const validRow = {
    Date: '2024-01-15',
    Merchant: 'Coffee Shop',
    Category: 'Food & Drink',
    Account: 'Checking',
    'Original Statement': 'COFFEE SHOP 123',
    Notes: '',
    Amount: '-4.50',
    Tags: '',
  };

  it('accepts a valid row', () => {
    const result = validateRow(validRow, 2);
    expect(result.valid).toBe(true);
  });

  it('rejects row with missing date', () => {
    const result = validateRow({ ...validRow, Date: '' }, 2);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining('Row 2'));
    expect(result.errors).toContainEqual(expect.stringContaining('date'));
  });

  it('rejects row with unparseable date', () => {
    const result = validateRow({ ...validRow, Date: 'not-a-date' }, 3);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining('Row 3'));
  });

  it('rejects row with missing amount', () => {
    const result = validateRow({ ...validRow, Amount: '' }, 4);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining('amount'));
  });

  it('rejects row with non-numeric amount', () => {
    const result = validateRow({ ...validRow, Amount: 'abc' }, 5);
    expect(result.valid).toBe(false);
  });

  it('rejects row with missing account', () => {
    const result = validateRow({ ...validRow, Account: '  ' }, 6);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining('account'));
  });

  it('rejects row with both merchant and original statement empty', () => {
    const result = validateRow({ ...validRow, Merchant: '', 'Original Statement': '' }, 7);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining('merchant'));
  });

  it('accepts row with empty merchant but non-empty original statement', () => {
    const result = validateRow({ ...validRow, Merchant: '' }, 8);
    expect(result.valid).toBe(true);
  });

  it('accepts row with empty original statement but non-empty merchant', () => {
    const result = validateRow({ ...validRow, 'Original Statement': '' }, 9);
    expect(result.valid).toBe(true);
  });

  it('collects multiple errors on the same row', () => {
    const result = validateRow({ ...validRow, Date: '', Amount: '', Account: '' }, 10);
    expect(result.valid).toBe(false);
    expect(result.errors!.length).toBeGreaterThanOrEqual(3);
  });
});

describe('transformRow', () => {
  const validRow = {
    Date: '2024-01-15',
    Merchant: 'Coffee Shop',
    Category: 'Food & Drink',
    Account: 'Checking',
    'Original Statement': 'COFFEE SHOP 123',
    Notes: 'morning coffee',
    Amount: '-4.50',
    Tags: '',
  };

  it('transforms a valid row correctly', () => {
    const result = transformRow(validRow);
    expect(result.date).toBe('2024-01-15');
    expect(result.amount).toBe(-450);
    expect(result.payee).toBe('COFFEE SHOP 123');
    expect(result.memo).toBe('morning coffee');
    expect(result.merchantName).toBe('Coffee Shop');
    expect(result.categoryName).toBe('Food & Drink');
    expect(result.accountName).toBe('Checking');
  });

  it('uses merchant as payee fallback when original statement is empty', () => {
    const row = { ...validRow, 'Original Statement': '' };
    const result = transformRow(row);
    expect(result.payee).toBe('Coffee Shop');
  });

  it('uses merchant as payee fallback when original statement is whitespace', () => {
    const row = { ...validRow, 'Original Statement': '   ' };
    const result = transformRow(row);
    expect(result.payee).toBe('Coffee Shop');
  });

  it('sets memo to null when notes is empty', () => {
    const row = { ...validRow, Notes: '' };
    const result = transformRow(row);
    expect(result.memo).toBeNull();
  });

  it('sets memo to null when notes is whitespace', () => {
    const row = { ...validRow, Notes: '   ' };
    const result = transformRow(row);
    expect(result.memo).toBeNull();
  });

  it('converts amount 19.99 to 1999 cents', () => {
    const row = { ...validRow, Amount: '19.99' };
    expect(transformRow(row).amount).toBe(1999);
  });

  it('converts amount 0.01 to 1 cent', () => {
    const row = { ...validRow, Amount: '0.01' };
    expect(transformRow(row).amount).toBe(1);
  });

  it('converts amount -18.32 to -1832 cents', () => {
    const row = { ...validRow, Amount: '-18.32' };
    expect(transformRow(row).amount).toBe(-1832);
  });

  it('converts amount 0 to 0 cents', () => {
    const row = { ...validRow, Amount: '0' };
    expect(transformRow(row).amount).toBe(0);
  });

  it('converts amount 1000.50 to 100050 cents', () => {
    const row = { ...validRow, Amount: '1000.50' };
    expect(transformRow(row).amount).toBe(100050);
  });

  it('parses US date format in transformation', () => {
    const row = { ...validRow, Date: '1/5/2024' };
    expect(transformRow(row).date).toBe('2024-01-05');
  });
});
