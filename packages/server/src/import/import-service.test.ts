import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseCsv, parseDate, validateRow, transformRow, previewImport, executeImport } from './import-service.js';
import { createDatabase } from '../db/connection.js';
import { generateDedupHash } from '../sync/simplefin-client.js';
import type Database from 'better-sqlite3';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';

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

describe('parseCsv — bank statement format', () => {
  const BANK_HEADER = 'Transaction Date\tTransaction Description\tTransaction Type\tDebit\tCredit\tBalance';

  it('parses tab-delimited bank statement with Debit/Credit columns', () => {
    const csv = `${BANK_HEADER}\n04/03/2026\tACH Withdrawal CITI AUTOPAY PAYMENT\tDebit\t$115.02\t0\t$928.47`;
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].Date).toBe('04/03/2026');
    expect(rows[0].Merchant).toBe('ACH Withdrawal CITI AUTOPAY PAYMENT');
    expect(rows[0]['Original Statement']).toBe('ACH Withdrawal CITI AUTOPAY PAYMENT');
    expect(rows[0].Amount).toBe('-115.02');
    expect(rows[0].Account).toBe('Bank Statement');
    expect(rows[0].Category).toBe('');
  });

  it('converts credit amounts to positive', () => {
    const csv = `${BANK_HEADER}\n04/03/2026\tDIRECT DEPOSIT\tCredit\t0\t$1500.00\t$2428.47`;
    const rows = parseCsv(csv);
    expect(rows[0].Amount).toBe('1500');
  });

  it('handles $ and comma in amounts', () => {
    const csv = `${BANK_HEADER}\n04/03/2026\tBIG PURCHASE\tDebit\t$1,234.56\t0\t$100.00`;
    const rows = parseCsv(csv);
    expect(rows[0].Amount).toBe('-1234.56');
  });

  it('parses multiple bank statement rows', () => {
    const csv = [
      BANK_HEADER,
      '04/03/2026\tACH Withdrawal CITI AUTOPAY PAYMENT\tDebit\t$115.02\t0\t$928.47',
      '04/01/2026\tACH Withdrawal GCWW/EZ-PAY UTILITIES\tDebit\t$76.95\t0\t$1043.49',
      '03/31/2026\tACH Withdrawal SST 833-977-0334 Loan Pmt\tDebit\t$80.74\t0\t$1120.44',
    ].join('\n');
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(3);
    expect(rows[0].Amount).toBe('-115.02');
    expect(rows[1].Amount).toBe('-76.95');
    expect(rows[2].Amount).toBe('-80.74');
  });

  it('handles comma-delimited bank statement', () => {
    const csv = 'Transaction Date,Transaction Description,Transaction Type,Debit,Credit,Balance\n04/03/2026,PAYMENT,$115.02,0,$928.47';
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(1);
  });

  it('sets all rows to Account "Bank Statement"', () => {
    const csv = [
      BANK_HEADER,
      '04/03/2026\tPAYMENT ONE\tDebit\t$10.00\t0\t$90.00',
      '04/02/2026\tPAYMENT TWO\tDebit\t$20.00\t0\t$80.00',
    ].join('\n');
    const rows = parseCsv(csv);
    expect(rows.every(r => r.Account === 'Bank Statement')).toBe(true);
  });
});

// --- Integration tests requiring database ---

const MONARCH_HEADER = 'Date,Merchant,Category,Account,Original Statement,Notes,Amount,Tags';

function makeCsvRow(
  date = '2024-01-15',
  merchant = 'Coffee Shop',
  category = 'Food & Drink',
  account = 'Checking',
  origStmt = 'COFFEE SHOP 123',
  notes = '',
  amount = '-4.50',
  tags = '',
): string {
  return `${date},${merchant},${category},${account},${origStmt},${notes},${amount},${tags}`;
}

function makeCsv(...rows: string[]): string {
  return `${MONARCH_HEADER}\n${rows.join('\n')}`;
}

describe('previewImport', () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'minerva-import-test-'));
    db = createDatabase(join(tmpDir, 'test.db'));

    // Create test accounts
    db.prepare(`INSERT INTO accounts (id, name, institution, type, balance, currency, last_synced) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`).run('acct-checking', 'My Checking Account', 'Bank', 'banking', 0, 'USD');
    db.prepare(`INSERT INTO accounts (id, name, institution, type, balance, currency, last_synced) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`).run('acct-savings', 'Savings Account', 'Bank', 'banking', 0, 'USD');

    // Create test category group and categories
    db.prepare(`INSERT INTO category_groups (name, sort_order) VALUES (?, ?)`).run('Expenses', 0);
    const groupId = (db.prepare('SELECT id FROM category_groups WHERE name = ?').get('Expenses') as { id: number }).id;
    db.prepare(`INSERT INTO categories (name, group_id, sort_order) VALUES (?, ?, ?)`).run('Food & Drink', groupId, 0);
    db.prepare(`INSERT INTO categories (name, group_id, sort_order) VALUES (?, ?, ?)`).run('Auto & Transport', groupId, 1);
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns correct row counts and sample rows', () => {
    const csv = makeCsv(
      makeCsvRow('2024-01-15', 'Coffee Shop', 'Food & Drink', 'Checking', 'COFFEE SHOP 123', '', '-4.50'),
      makeCsvRow('2024-01-16', 'Gas Station', 'Auto & Transport', 'Checking', 'GAS STATION 456', '', '-35.00'),
    );
    const result = previewImport(db, csv);
    expect(result.totalRows).toBe(2);
    expect(result.validRows).toBe(2);
    expect(result.sampleRows).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
  });

  it('auto-suggests account matches by case-insensitive substring', () => {
    const csv = makeCsv(makeCsvRow('2024-01-15', 'Coffee Shop', 'Food & Drink', 'Checking', 'COFFEE SHOP', '', '-4.50'));
    const result = previewImport(db, csv);
    const checkingMatch = result.accounts.find(a => a.csvName === 'Checking');
    expect(checkingMatch).toBeDefined();
    expect(checkingMatch!.suggestedId).toBe('acct-checking');
    expect(checkingMatch!.suggestedName).toBe('My Checking Account');
  });

  it('auto-suggests category matches by exact case-insensitive name', () => {
    const csv = makeCsv(makeCsvRow('2024-01-15', 'Coffee Shop', 'Food & Drink', 'Checking', 'COFFEE SHOP', '', '-4.50'));
    const result = previewImport(db, csv);
    const categoryMatch = result.categories.find(c => c.csvName === 'Food & Drink');
    expect(categoryMatch).toBeDefined();
    expect(categoryMatch!.suggestedId).not.toBeNull();
    expect(categoryMatch!.suggestedName).toBe('Food & Drink');
  });

  it('returns null suggestion for unmatched accounts', () => {
    const csv = makeCsv(makeCsvRow('2024-01-15', 'Coffee Shop', 'Food & Drink', 'Unknown Account', 'COFFEE SHOP', '', '-4.50'));
    const result = previewImport(db, csv);
    const match = result.accounts.find(a => a.csvName === 'Unknown Account');
    expect(match).toBeDefined();
    expect(match!.suggestedId).toBeNull();
  });

  it('returns null suggestion for unmatched categories', () => {
    const csv = makeCsv(makeCsvRow('2024-01-15', 'Coffee Shop', 'Unknown Category', 'Checking', 'COFFEE SHOP', '', '-4.50'));
    const result = previewImport(db, csv);
    const match = result.categories.find(c => c.csvName === 'Unknown Category');
    expect(match).toBeDefined();
    expect(match!.suggestedId).toBeNull();
  });

  it('identifies duplicates in dedup stats', () => {
    // Insert an existing transaction with same hash
    const hash = generateDedupHash('acct-checking', '2024-01-15', -450, 'COFFEE SHOP 123');
    db.prepare(`INSERT INTO transactions (id, account_id, date, amount, pending, payee, memo, dedup_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run('existing-txn', 'acct-checking', '2024-01-15', -450, 0, 'COFFEE SHOP 123', null, hash);

    const csv = makeCsv(makeCsvRow('2024-01-15', 'Coffee Shop', 'Food & Drink', 'Checking', 'COFFEE SHOP 123', '', '-4.50'));
    const result = previewImport(db, csv);
    expect(result.dedupStats.duplicateCount).toBe(1);
    expect(result.dedupStats.newCount).toBe(0);
  });

  it('counts unmapped accounts as new in dedup stats', () => {
    const csv = makeCsv(makeCsvRow('2024-01-15', 'Coffee Shop', 'Food & Drink', 'Unknown Account', 'COFFEE SHOP', '', '-4.50'));
    const result = previewImport(db, csv);
    expect(result.dedupStats.newCount).toBe(1);
    expect(result.dedupStats.duplicateCount).toBe(0);
  });

  it('limits sample rows to first 10', () => {
    const rows = Array.from({ length: 15 }, (_, i) =>
      makeCsvRow(`2024-01-${String(i + 1).padStart(2, '0')}`, `Merchant ${i}`, 'Food & Drink', 'Checking', `STMT ${i}`, '', `-${i + 1}.00`)
    );
    const csv = makeCsv(...rows);
    const result = previewImport(db, csv);
    expect(result.totalRows).toBe(15);
    expect(result.sampleRows).toHaveLength(10);
  });

  it('returns rowCountByAccount with per-account row counts', () => {
    const csv = makeCsv(
      makeCsvRow('2024-01-15', 'Coffee Shop', 'Food & Drink', 'Checking', 'COFFEE SHOP 123', '', '-4.50'),
      makeCsvRow('2024-01-16', 'Gas Station', 'Auto & Transport', 'Checking', 'GAS STATION 456', '', '-35.00'),
      makeCsvRow('2024-01-17', 'Grocery', 'Food & Drink', 'Savings', 'GROCERY 789', '', '-25.00'),
    );
    const result = previewImport(db, csv);
    expect(result.rowCountByAccount).toEqual({ Checking: 2, Savings: 1 });
  });

  it('rowCountByAccount excludes invalid rows', () => {
    const csv = makeCsv(
      makeCsvRow('2024-01-15', 'Coffee Shop', 'Food & Drink', 'Checking', 'COFFEE SHOP 123', '', '-4.50'),
      makeCsvRow('not-a-date', 'Bad Row', 'Food & Drink', 'Checking', 'BAD ROW', '', '-1.00'),
    );
    const result = previewImport(db, csv);
    expect(result.rowCountByAccount).toEqual({ Checking: 1 });
  });

  it('includes validation errors with row numbers', () => {
    const csv = makeCsv(
      makeCsvRow('2024-01-15', 'Coffee Shop', 'Food & Drink', 'Checking', 'COFFEE SHOP', '', '-4.50'),
      makeCsvRow('not-a-date', 'Coffee Shop', 'Food & Drink', 'Checking', 'COFFEE SHOP', '', '-4.50'),
    );
    const result = previewImport(db, csv);
    expect(result.validRows).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Row 3');
  });
});

describe('executeImport', () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'minerva-import-exec-test-'));
    db = createDatabase(join(tmpDir, 'test.db'));

    // Create test accounts
    db.prepare(`INSERT INTO accounts (id, name, institution, type, balance, currency, last_synced) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`).run('acct-checking', 'My Checking Account', 'Bank', 'banking', 0, 'USD');

    // Create test category group and categories
    db.prepare(`INSERT INTO category_groups (name, sort_order) VALUES (?, ?)`).run('Expenses', 0);
    const groupId = (db.prepare('SELECT id FROM category_groups WHERE name = ?').get('Expenses') as { id: number }).id;
    db.prepare(`INSERT INTO categories (name, group_id, sort_order) VALUES (?, ?, ?)`).run('Food & Drink', groupId, 0);
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('inserts transactions atomically', () => {
    const csv = makeCsv(
      makeCsvRow('2024-01-15', 'Coffee Shop', 'Food & Drink', 'Checking', 'COFFEE SHOP 123', '', '-4.50'),
      makeCsvRow('2024-01-16', 'Gas Station', 'Auto', 'Checking', 'GAS STATION 456', '', '-35.00'),
    );
    const result = executeImport(db, csv, { Checking: 'acct-checking' }, {});
    expect(result.importedCount).toBe(2);
    expect(result.skippedCount).toBe(0);

    const txns = db.prepare('SELECT * FROM transactions').all();
    expect(txns).toHaveLength(2);
  });

  it('skips duplicates and reports skip count', () => {
    const csv = makeCsv(makeCsvRow('2024-01-15', 'Coffee Shop', 'Food & Drink', 'Checking', 'COFFEE SHOP 123', '', '-4.50'));

    // First import
    executeImport(db, csv, { Checking: 'acct-checking' }, {});
    // Second import (same data)
    const result = executeImport(db, csv, { Checking: 'acct-checking' }, {});

    expect(result.importedCount).toBe(0);
    expect(result.skippedCount).toBe(1);

    const txns = db.prepare('SELECT * FROM transactions').all();
    expect(txns).toHaveLength(1);
  });

  it('skips rows for unmapped accounts instead of throwing', () => {
    // Add a second account to the DB
    db.prepare(`INSERT INTO accounts (id, name, institution, type, balance, currency, last_synced) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`).run('acct-savings', 'Savings Account', 'Bank', 'banking', 0, 'USD');

    const csv = makeCsv(
      makeCsvRow('2024-01-15', 'Coffee Shop', 'Food & Drink', 'Checking', 'COFFEE SHOP 123', '', '-4.50'),
      makeCsvRow('2024-01-16', 'Grocery', 'Food & Drink', 'Savings', 'GROCERY 789', '', '-25.00'),
      makeCsvRow('2024-01-17', 'Gas Station', 'Auto', 'Checking', 'GAS STATION 456', '', '-35.00'),
    );

    // Only map Checking, omit Savings
    const result = executeImport(db, csv, { Checking: 'acct-checking' }, {});

    expect(result.importedCount).toBe(2); // Only Checking rows imported
    expect(result.skippedByAccountFilter).toBe(1); // Savings row skipped
    expect(result.skippedCount).toBe(0); // No dedup skips

    const txns = db.prepare('SELECT * FROM transactions').all();
    expect(txns).toHaveLength(2);
  });

  it('returns skippedByAccountFilter of 0 when all accounts are mapped', () => {
    const csv = makeCsv(
      makeCsvRow('2024-01-15', 'Coffee Shop', 'Food & Drink', 'Checking', 'COFFEE SHOP 123', '', '-4.50'),
    );
    const result = executeImport(db, csv, { Checking: 'acct-checking' }, {});
    expect(result.skippedByAccountFilter).toBe(0);
    expect(result.importedCount).toBe(1);
  });

  it('skips all rows when no accounts are mapped', () => {
    const csv = makeCsv(makeCsvRow('2024-01-15', 'Coffee Shop', 'Food & Drink', 'Checking', 'COFFEE SHOP', '', '-4.50'));
    const result = executeImport(db, csv, {}, {});
    expect(result.importedCount).toBe(0);
    expect(result.skippedByAccountFilter).toBe(1);
    expect(result.skippedCount).toBe(0);
  });

  it('sets pending to 0 for all imported transactions', () => {
    const csv = makeCsv(makeCsvRow('2024-01-15', 'Coffee Shop', 'Food & Drink', 'Checking', 'COFFEE SHOP 123', '', '-4.50'));
    executeImport(db, csv, { Checking: 'acct-checking' }, {});

    const txns = db.prepare('SELECT pending FROM transactions').all() as { pending: number }[];
    for (const txn of txns) {
      expect(txn.pending).toBe(0);
    }
  });

  it('applies CSV category as fallback for uncategorized transactions', () => {
    const categoryId = (db.prepare('SELECT id FROM categories WHERE name = ?').get('Food & Drink') as { id: number }).id;
    const csv = makeCsv(makeCsvRow('2024-01-15', 'Coffee Shop', 'Food & Drink', 'Checking', 'COFFEE SHOP 123', '', '-4.50'));

    const result = executeImport(db, csv, { Checking: 'acct-checking' }, { 'Food & Drink': categoryId });
    expect(result.categorizedFromCsv).toBe(1);

    const txn = db.prepare('SELECT category_id, rule_id FROM transactions').get() as { category_id: number | null; rule_id: number | null };
    expect(txn.category_id).toBe(categoryId);
    expect(txn.rule_id).toBeNull(); // CSV fallback, not rule
  });

  it('rules engine categorization is not overridden by CSV fallback', () => {
    // Create a categorization rule that matches payee containing "COFFEE"
    const categoryId = (db.prepare('SELECT id FROM categories WHERE name = ?').get('Food & Drink') as { id: number }).id;
    db.prepare(`INSERT INTO categorization_rules (name, category_id, merchant_pattern, match_type, specificity_score) VALUES (?, ?, ?, ?, ?)`).run('Coffee Rule', categoryId, 'COFFEE', 'contains', 100);

    // Create a second category for the CSV mapping
    const groupId = (db.prepare('SELECT id FROM category_groups LIMIT 1').get() as { id: number }).id;
    db.prepare(`INSERT INTO categories (name, group_id, sort_order) VALUES (?, ?, ?)`).run('Different Category', groupId, 2);
    const diffCategoryId = (db.prepare('SELECT id FROM categories WHERE name = ?').get('Different Category') as { id: number }).id;

    const csv = makeCsv(makeCsvRow('2024-01-15', 'Coffee Shop', 'Food & Drink', 'Checking', 'COFFEE SHOP 123', '', '-4.50'));
    const result = executeImport(db, csv, { Checking: 'acct-checking' }, { 'Food & Drink': diffCategoryId });

    expect(result.categorizedByRules).toBe(1);
    expect(result.categorizedFromCsv).toBe(0); // Rule won, CSV fallback skipped

    const txn = db.prepare('SELECT category_id, rule_id FROM transactions').get() as { category_id: number; rule_id: number };
    expect(txn.category_id).toBe(categoryId); // Rule's category, not CSV's
    expect(txn.rule_id).not.toBeNull();
  });

  it('stores amounts as integer cents', () => {
    const csv = makeCsv(makeCsvRow('2024-01-15', 'Coffee Shop', 'Food & Drink', 'Checking', 'COFFEE SHOP 123', '', '-4.50'));
    executeImport(db, csv, { Checking: 'acct-checking' }, {});

    const txn = db.prepare('SELECT amount FROM transactions').get() as { amount: number };
    expect(txn.amount).toBe(-450);
    expect(Number.isInteger(txn.amount)).toBe(true);
  });

  it('stores correct payee and memo fields', () => {
    const csv = makeCsv(makeCsvRow('2024-01-15', 'Coffee Shop', 'Food & Drink', 'Checking', 'COFFEE SHOP 123', 'morning coffee', '-4.50'));
    executeImport(db, csv, { Checking: 'acct-checking' }, {});

    const txn = db.prepare('SELECT payee, memo FROM transactions').get() as { payee: string; memo: string };
    expect(txn.payee).toBe('COFFEE SHOP 123');
    expect(txn.memo).toBe('morning coffee');
  });

  it('handles unmapped categories by leaving category_id null', () => {
    const csv = makeCsv(makeCsvRow('2024-01-15', 'Coffee Shop', 'Unknown Category', 'Checking', 'COFFEE SHOP 123', '', '-4.50'));
    executeImport(db, csv, { Checking: 'acct-checking' }, {});

    const txn = db.prepare('SELECT category_id FROM transactions').get() as { category_id: number | null };
    expect(txn.category_id).toBeNull();
  });

  it('recalculates balance for manual accounts after import', () => {
    // Create a manual account
    db.prepare(`INSERT INTO accounts (id, name, institution, type, balance, currency, source) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('manual_test', 'Manual Checking', 'Local Bank', 'banking', 0, 'USD', 'manual');

    const csv = makeCsv(
      makeCsvRow('2024-01-15', 'Coffee Shop', 'Food & Drink', 'Manual Acct', 'COFFEE SHOP 123', '', '-4.50'),
      makeCsvRow('2024-01-16', 'Deposit', 'Income', 'Manual Acct', 'DEPOSIT', '', '100.00'),
    );

    const result = executeImport(db, csv, { 'Manual Acct': 'manual_test' }, {});

    expect(result.recalculatedAccounts).toBe(1);

    const account = db.prepare('SELECT balance FROM accounts WHERE id = ?').get('manual_test') as { balance: number };
    expect(account.balance).toBe(9550); // $100.00 - $4.50 = $95.50 = 9550 cents
  });

  it('records balance snapshot for manual accounts after import', () => {
    db.prepare(`INSERT INTO accounts (id, name, institution, type, balance, currency, source) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('manual_snap', 'Manual Snap', 'Bank', 'banking', 0, 'USD', 'manual');

    const csv = makeCsv(makeCsvRow('2024-01-15', 'Coffee Shop', 'Food & Drink', 'Snap Acct', 'COFFEE SHOP', '', '-10.00'));

    executeImport(db, csv, { 'Snap Acct': 'manual_snap' }, {});

    const today = new Date().toISOString().split('T')[0];
    const snapshot = db.prepare('SELECT * FROM balance_snapshots WHERE account_id = ? AND date = ?').get('manual_snap', today) as { balance: number } | undefined;

    expect(snapshot).toBeDefined();
    expect(snapshot!.balance).toBe(-1000);
  });

  it('imports bank statement CSV with dedup on overlapping 30-day exports', () => {
    // Create a manual account for the bank statement
    db.prepare(`INSERT INTO accounts (id, name, institution, type, balance, currency, source) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('acct-discover', 'Discover Checking', 'Discover', 'banking', 0, 'USD', 'manual');

    const bankHeader = 'Transaction Date\tTransaction Description\tTransaction Type\tDebit\tCredit\tBalance';

    // First export: 2 transactions
    const csv1 = [
      bankHeader,
      '04/01/2026\tACH Withdrawal UTILITIES\tDebit\t$76.95\t0\t$1043.49',
      '03/31/2026\tACH Withdrawal LOAN PMT\tDebit\t$80.74\t0\t$1120.44',
    ].join('\n');

    const result1 = executeImport(db, csv1, { 'Bank Statement': 'acct-discover' }, {});
    expect(result1.importedCount).toBe(2);

    // Second export: overlapping + 1 new transaction
    const csv2 = [
      bankHeader,
      '04/03/2026\tACH Withdrawal CITI AUTOPAY\tDebit\t$115.02\t0\t$928.47',
      '04/01/2026\tACH Withdrawal UTILITIES\tDebit\t$76.95\t0\t$1043.49',
      '03/31/2026\tACH Withdrawal LOAN PMT\tDebit\t$80.74\t0\t$1120.44',
    ].join('\n');

    const result2 = executeImport(db, csv2, { 'Bank Statement': 'acct-discover' }, {});
    expect(result2.importedCount).toBe(1);  // Only the new one
    expect(result2.skippedCount).toBe(2);   // The 2 duplicates

    const txns = db.prepare('SELECT * FROM transactions WHERE account_id = ?').all('acct-discover');
    expect(txns).toHaveLength(3);
  });

  it('does not recalculate balance for SimpleFIN accounts', () => {
    // The default test account 'acct-checking' has no source set, so it defaults to 'simplefin'
    const csv = makeCsv(makeCsvRow('2024-01-15', 'Coffee Shop', 'Food & Drink', 'Checking', 'COFFEE SHOP 123', '', '-4.50'));

    const result = executeImport(db, csv, { Checking: 'acct-checking' }, {});

    expect(result.recalculatedAccounts).toBe(0);

    // Balance should remain unchanged (0) since SimpleFIN accounts are not recalculated
    const account = db.prepare('SELECT balance FROM accounts WHERE id = ?').get('acct-checking') as { balance: number };
    expect(account.balance).toBe(0);
  });

  it('returns recalculatedAccounts of 0 when no manual accounts receive transactions', () => {
    const csv = makeCsv(makeCsvRow('2024-01-15', 'Coffee Shop', 'Food & Drink', 'Checking', 'COFFEE SHOP 123', '', '-4.50'));
    const result = executeImport(db, csv, { Checking: 'acct-checking' }, {});
    expect(result.recalculatedAccounts).toBe(0);
  });
});
