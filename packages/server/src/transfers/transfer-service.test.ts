import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createDatabase } from '../db/connection.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import {
  detectTransferCandidates,
  confirmTransfer,
  dismissTransfer,
  unlinkTransfer,
  manuallyLinkTransfer,
  listTransferCandidates,
  listConfirmedTransfers,
} from './transfer-service.js';

let db: Database.Database;
let tempDir: string;

function seedAccounts(db: Database.Database) {
  db.prepare(`INSERT INTO accounts (id, name, institution, type, balance) VALUES ('checking', 'Checking', 'Bank A', 'checking', 500000)`).run();
  db.prepare(`INSERT INTO accounts (id, name, institution, type, balance) VALUES ('savings', 'Savings', 'Bank A', 'savings', 300000)`).run();
  db.prepare(`INSERT INTO accounts (id, name, institution, type, balance) VALUES ('credit', 'Credit Card', 'Bank B', 'credit', -50000)`).run();
}

function insertTransaction(db: Database.Database, id: string, accountId: string, date: string, amount: number, pending = 0) {
  db.prepare(`INSERT INTO transactions (id, account_id, date, amount, pending, payee) VALUES (?, ?, ?, ?, ?, ?)`).run(
    id, accountId, date, amount, pending, `Payee for ${id}`,
  );
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'transfer-test-'));
  db = createDatabase(join(tempDir, 'test.db'));
  seedAccounts(db);
});

afterEach(() => {
  db.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describe('detectTransferCandidates', () => {
  it('detects offsetting amounts across different accounts within date window', () => {
    insertTransaction(db, 'txn-a', 'checking', '2024-01-15', -50000);
    insertTransaction(db, 'txn-b', 'savings', '2024-01-16', 50000);

    const count = detectTransferCandidates(db, ['txn-a']);
    expect(count).toBe(1);

    const candidates = listTransferCandidates(db);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].transactionA.id).toBe('txn-a');
    expect(candidates[0].transactionB.id).toBe('txn-b');
  });

  it('does not match transactions on the same account', () => {
    insertTransaction(db, 'txn-a', 'checking', '2024-01-15', -50000);
    insertTransaction(db, 'txn-b', 'checking', '2024-01-16', 50000);

    const count = detectTransferCandidates(db, ['txn-a']);
    expect(count).toBe(0);
  });

  it('does not match non-offsetting amounts', () => {
    insertTransaction(db, 'txn-a', 'checking', '2024-01-15', -50000);
    insertTransaction(db, 'txn-b', 'savings', '2024-01-16', 30000);

    const count = detectTransferCandidates(db, ['txn-a']);
    expect(count).toBe(0);
  });

  it('does not match transactions outside the date window', () => {
    insertTransaction(db, 'txn-a', 'checking', '2024-01-15', -50000);
    insertTransaction(db, 'txn-b', 'savings', '2024-01-20', 50000);

    const count = detectTransferCandidates(db, ['txn-a']);
    expect(count).toBe(0);
  });

  it('matches transactions at the boundary of the date window (3 days)', () => {
    insertTransaction(db, 'txn-a', 'checking', '2024-01-15', -50000);
    insertTransaction(db, 'txn-b', 'savings', '2024-01-18', 50000);

    const count = detectTransferCandidates(db, ['txn-a']);
    expect(count).toBe(1);
  });

  it('excludes pending transactions', () => {
    insertTransaction(db, 'txn-a', 'checking', '2024-01-15', -50000, 0);
    insertTransaction(db, 'txn-b', 'savings', '2024-01-16', 50000, 1);

    const count = detectTransferCandidates(db, ['txn-a']);
    expect(count).toBe(0);
  });

  it('does not re-match already linked transactions', () => {
    insertTransaction(db, 'txn-a', 'checking', '2024-01-15', -50000);
    insertTransaction(db, 'txn-b', 'savings', '2024-01-16', 50000);

    detectTransferCandidates(db, ['txn-a']);
    expect(listTransferCandidates(db)).toHaveLength(1);

    // Running detection again with same or new transactions should not create duplicates
    const count = detectTransferCandidates(db, ['txn-a']);
    expect(count).toBe(0);
    expect(listTransferCandidates(db)).toHaveLength(1);
  });

  it('does not re-match dismissed transactions', () => {
    insertTransaction(db, 'txn-a', 'checking', '2024-01-15', -50000);
    insertTransaction(db, 'txn-b', 'savings', '2024-01-16', 50000);

    detectTransferCandidates(db, ['txn-a']);
    const candidates = listTransferCandidates(db);
    dismissTransfer(db, candidates[0].id);

    const count = detectTransferCandidates(db, ['txn-a']);
    expect(count).toBe(0);
  });

  it('enforces canonical ordering (earlier date is transaction_a)', () => {
    insertTransaction(db, 'txn-later', 'checking', '2024-01-17', -50000);
    insertTransaction(db, 'txn-earlier', 'savings', '2024-01-15', 50000);

    detectTransferCandidates(db, ['txn-later']);
    const candidates = listTransferCandidates(db);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].transactionA.id).toBe('txn-earlier');
    expect(candidates[0].transactionB.id).toBe('txn-later');
  });

  it('uses lower ID for canonical ordering when dates are equal', () => {
    insertTransaction(db, 'aaa-txn', 'checking', '2024-01-15', -50000);
    insertTransaction(db, 'zzz-txn', 'savings', '2024-01-15', 50000);

    detectTransferCandidates(db, ['aaa-txn']);
    const candidates = listTransferCandidates(db);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].transactionA.id).toBe('aaa-txn');
    expect(candidates[0].transactionB.id).toBe('zzz-txn');
  });

  it('handles custom date window', () => {
    insertTransaction(db, 'txn-a', 'checking', '2024-01-15', -50000);
    insertTransaction(db, 'txn-b', 'savings', '2024-01-17', 50000);

    // 1-day window should not match
    expect(detectTransferCandidates(db, ['txn-a'], 1)).toBe(0);
    // But default 3-day window should
    // Already linked, clean up first
  });

  it('returns 0 for empty transaction IDs', () => {
    const count = detectTransferCandidates(db, []);
    expect(count).toBe(0);
  });
});

describe('confirmTransfer', () => {
  it('sets confirmed to 1', () => {
    insertTransaction(db, 'txn-a', 'checking', '2024-01-15', -50000);
    insertTransaction(db, 'txn-b', 'savings', '2024-01-16', 50000);
    detectTransferCandidates(db, ['txn-a']);

    const candidates = listTransferCandidates(db);
    confirmTransfer(db, candidates[0].id);

    expect(listTransferCandidates(db)).toHaveLength(0);
    expect(listConfirmedTransfers(db)).toHaveLength(1);
  });

  it('throws for non-existent link ID', () => {
    expect(() => confirmTransfer(db, 99999)).toThrow();
  });
});

describe('dismissTransfer', () => {
  it('sets confirmed to -1', () => {
    insertTransaction(db, 'txn-a', 'checking', '2024-01-15', -50000);
    insertTransaction(db, 'txn-b', 'savings', '2024-01-16', 50000);
    detectTransferCandidates(db, ['txn-a']);

    const candidates = listTransferCandidates(db);
    dismissTransfer(db, candidates[0].id);

    expect(listTransferCandidates(db)).toHaveLength(0);
    expect(listConfirmedTransfers(db)).toHaveLength(0);
  });

  it('throws for non-existent link ID', () => {
    expect(() => dismissTransfer(db, 99999)).toThrow();
  });
});

describe('unlinkTransfer', () => {
  it('deletes the transfer link row', () => {
    insertTransaction(db, 'txn-a', 'checking', '2024-01-15', -50000);
    insertTransaction(db, 'txn-b', 'savings', '2024-01-16', 50000);
    detectTransferCandidates(db, ['txn-a']);

    const candidates = listTransferCandidates(db);
    confirmTransfer(db, candidates[0].id);
    expect(listConfirmedTransfers(db)).toHaveLength(1);

    unlinkTransfer(db, candidates[0].id);
    expect(listConfirmedTransfers(db)).toHaveLength(0);
  });

  it('throws for non-existent link ID', () => {
    expect(() => unlinkTransfer(db, 99999)).toThrow();
  });
});

describe('manuallyLinkTransfer', () => {
  it('creates a confirmed transfer link', () => {
    insertTransaction(db, 'txn-a', 'checking', '2024-01-15', -50000);
    insertTransaction(db, 'txn-b', 'savings', '2024-01-20', 50000);

    const link = manuallyLinkTransfer(db, 'txn-a', 'txn-b');
    expect(link.confirmed).toBe(1);

    expect(listConfirmedTransfers(db)).toHaveLength(1);
  });

  it('enforces canonical ordering', () => {
    insertTransaction(db, 'txn-later', 'checking', '2024-01-20', -50000);
    insertTransaction(db, 'txn-earlier', 'savings', '2024-01-15', 50000);

    const link = manuallyLinkTransfer(db, 'txn-later', 'txn-earlier');
    const confirmed = listConfirmedTransfers(db);
    expect(confirmed[0].transactionA.id).toBe('txn-earlier');
    expect(confirmed[0].transactionB.id).toBe('txn-later');
    expect(link.transactionAId).toBe('txn-earlier');
  });

  it('throws for same-account transactions', () => {
    insertTransaction(db, 'txn-a', 'checking', '2024-01-15', -50000);
    insertTransaction(db, 'txn-b', 'checking', '2024-01-16', 50000);

    expect(() => manuallyLinkTransfer(db, 'txn-a', 'txn-b')).toThrow('different accounts');
  });
});

describe('listTransferCandidates', () => {
  it('returns candidate pairs with transaction details', () => {
    insertTransaction(db, 'txn-a', 'checking', '2024-01-15', -50000);
    insertTransaction(db, 'txn-b', 'savings', '2024-01-16', 50000);
    detectTransferCandidates(db, ['txn-a']);

    const candidates = listTransferCandidates(db);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].transactionA).toMatchObject({
      id: 'txn-a',
      date: '2024-01-15',
      amount: -50000,
      accountName: 'Checking',
    });
    expect(candidates[0].transactionB).toMatchObject({
      id: 'txn-b',
      date: '2024-01-16',
      amount: 50000,
      accountName: 'Savings',
    });
  });

  it('returns empty array when no candidates exist', () => {
    expect(listTransferCandidates(db)).toHaveLength(0);
  });
});

describe('listConfirmedTransfers', () => {
  it('returns confirmed pairs with transaction details', () => {
    insertTransaction(db, 'txn-a', 'checking', '2024-01-15', -50000);
    insertTransaction(db, 'txn-b', 'savings', '2024-01-16', 50000);
    manuallyLinkTransfer(db, 'txn-a', 'txn-b');

    const confirmed = listConfirmedTransfers(db);
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0].transactionA.accountName).toBe('Checking');
    expect(confirmed[0].transactionB.accountName).toBe('Savings');
  });

  it('returns empty array when no confirmed transfers exist', () => {
    expect(listConfirmedTransfers(db)).toHaveLength(0);
  });
});
