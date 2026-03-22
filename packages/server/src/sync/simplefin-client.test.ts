import { describe, it, expect } from 'vitest';
import {
  normalizeAccount,
  normalizeTransaction,
  generateDedupHash,
  createMockSimpleFINClient,
} from './simplefin-client.js';
import type { SimpleFINAccount, SimpleFINTransaction } from './simplefin-types.js';

describe('normalizeAccount', () => {
  const rawAccount: SimpleFINAccount = {
    id: 'acct-discover-checking',
    name: 'Discover Cashback Checking',
    conn_id: 'conn-discover',
    currency: 'USD',
    balance: '2847.53',
    'balance-date': 1711065600,
    transactions: [],
  };

  it('converts balance string to Cents', () => {
    const result = normalizeAccount(rawAccount, 'Discover');
    expect(result.balance).toBe(284753);
  });

  it('preserves account id and name', () => {
    const result = normalizeAccount(rawAccount, 'Discover');
    expect(result.id).toBe('acct-discover-checking');
    expect(result.name).toBe('Discover Cashback Checking');
  });

  it('sets institution from connection name', () => {
    const result = normalizeAccount(rawAccount, 'Discover');
    expect(result.institution).toBe('Discover');
  });

  it('sets currency', () => {
    const result = normalizeAccount(rawAccount, 'Discover');
    expect(result.currency).toBe('USD');
  });

  it('handles negative balance', () => {
    const account = { ...rawAccount, balance: '-150.25' };
    const result = normalizeAccount(account, 'Test');
    expect(result.balance).toBe(-15025);
  });
});

describe('normalizeTransaction', () => {
  const rawTxn: SimpleFINTransaction = {
    id: 'txn-disc-001',
    posted: 1711065600,
    amount: '-45.67',
    description: 'AMAZON.COM',
    pending: false,
  };

  it('converts amount string to Cents', () => {
    const result = normalizeTransaction(rawTxn, 'acct-discover-checking');
    expect(result.amount).toBe(-4567);
  });

  it('converts posted timestamp to ISO date string', () => {
    const result = normalizeTransaction(rawTxn, 'acct-discover-checking');
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('sets accountId', () => {
    const result = normalizeTransaction(rawTxn, 'acct-discover-checking');
    expect(result.accountId).toBe('acct-discover-checking');
  });

  it('uses description as payee', () => {
    const result = normalizeTransaction(rawTxn, 'acct-discover-checking');
    expect(result.payee).toBe('AMAZON.COM');
  });

  it('generates dedup hash', () => {
    const result = normalizeTransaction(rawTxn, 'acct-discover-checking');
    expect(result.dedupHash).toBeTruthy();
    expect(typeof result.dedupHash).toBe('string');
  });

  it('handles pending transaction (posted=0)', () => {
    const pendingTxn: SimpleFINTransaction = {
      id: 'txn-disc-004',
      posted: 0,
      amount: '-12.99',
      description: 'NETFLIX',
      transacted_at: 1711152000,
      pending: true,
    };
    const result = normalizeTransaction(pendingTxn, 'acct-discover-checking');
    expect(result.pending).toBe(true);
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('handles positive amount (deposit)', () => {
    const depositTxn: SimpleFINTransaction = {
      id: 'txn-disc-003',
      posted: 1710892800,
      amount: '3250.00',
      description: 'PAYROLL DEPOSIT',
    };
    const result = normalizeTransaction(depositTxn, 'acct-discover-checking');
    expect(result.amount).toBe(325000);
  });

  it('handles zero amount', () => {
    const zeroTxn: SimpleFINTransaction = {
      id: 'txn-zero',
      posted: 1710720000,
      amount: '0.00',
      description: 'ACCOUNT ADJUSTMENT',
    };
    const result = normalizeTransaction(zeroTxn, 'acct-test');
    expect(result.amount).toBe(0);
  });
});

describe('generateDedupHash', () => {
  it('produces deterministic hash for same inputs', () => {
    const hash1 = generateDedupHash('acct-1', '2024-03-22', -4567, 'AMAZON.COM');
    const hash2 = generateDedupHash('acct-1', '2024-03-22', -4567, 'AMAZON.COM');
    expect(hash1).toBe(hash2);
  });

  it('produces different hash for different inputs', () => {
    const hash1 = generateDedupHash('acct-1', '2024-03-22', -4567, 'AMAZON.COM');
    const hash2 = generateDedupHash('acct-1', '2024-03-22', -4567, 'COSTCO');
    expect(hash1).not.toBe(hash2);
  });

  it('returns a hex string', () => {
    const hash = generateDedupHash('acct-1', '2024-03-22', -4567, 'AMAZON.COM');
    expect(hash).toMatch(/^[a-f0-9]+$/);
  });
});

describe('createMockSimpleFINClient', () => {
  it('fetchAccounts returns fixture data with 3 accounts', async () => {
    const client = createMockSimpleFINClient();
    const result = await client.fetchAccounts();
    expect(result.accounts).toHaveLength(3);
    expect(result.errlist).toHaveLength(0);
  });

  it('fetchAccounts returns accounts with transactions', async () => {
    const client = createMockSimpleFINClient();
    const result = await client.fetchAccounts();
    const withTxns = result.accounts.filter(a => a.transactions.length > 0);
    expect(withTxns.length).toBeGreaterThanOrEqual(2);
  });

  it('fetchBalances returns accounts without transactions', async () => {
    const client = createMockSimpleFINClient();
    const result = await client.fetchBalances();
    expect(result.accounts).toHaveLength(3);
    for (const account of result.accounts) {
      expect(account.transactions).toHaveLength(0);
    }
  });

  it('fixture includes pending transactions', async () => {
    const client = createMockSimpleFINClient();
    const result = await client.fetchAccounts();
    const allTxns = result.accounts.flatMap(a => a.transactions);
    const pendingTxns = allTxns.filter(t => t.pending === true);
    expect(pendingTxns.length).toBeGreaterThanOrEqual(1);
  });

  it('fixture includes institution names matching user accounts', async () => {
    const client = createMockSimpleFINClient();
    const result = await client.fetchAccounts();
    const connectionNames = result.connections.map(c => c.name);
    expect(connectionNames).toContain('Discover');
    expect(connectionNames).toContain('Fidelity Investments');
    expect(connectionNames).toContain('Consumers Credit Union');
  });
});
