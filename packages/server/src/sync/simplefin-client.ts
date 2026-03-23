import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { toCents } from '@minerva/shared';
import type {
  SimpleFINAccountSet,
  SimpleFINClient,
  NormalizedAccount,
  NormalizedTransaction,
  SimpleFINAccount,
  SimpleFINTransaction,
} from './simplefin-types.js';

export function normalizeAccount(raw: SimpleFINAccount, institution: string): NormalizedAccount {
  return {
    id: raw.id,
    name: raw.name,
    institution,
    type: raw.transactions.length === 0 ? 'investment' : 'banking',
    balance: toCents(parseFloat(raw.balance)),
    currency: raw.currency,
    lastSynced: new Date().toISOString(),
  };
}

export function normalizeTransaction(raw: SimpleFINTransaction, accountId: string): NormalizedTransaction {
  const amount = toCents(parseFloat(raw.amount));
  const pending = raw.pending ?? false;

  let date: string;
  if (raw.posted === 0 && raw.transacted_at) {
    date = epochToDate(raw.transacted_at);
  } else if (raw.posted === 0) {
    date = new Date().toISOString().split('T')[0];
  } else {
    date = epochToDate(raw.posted);
  }

  const payee = raw.description;
  const dedupHash = generateDedupHash(accountId, date, amount, payee);

  return {
    id: raw.id,
    accountId,
    date,
    amount,
    pending,
    payee,
    memo: '',
    dedupHash,
  };
}

function epochToDate(epoch: number): string {
  const d = new Date(epoch * 1000);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function generateDedupHash(accountId: string, date: string, amount: number, payee: string): string {
  const input = `${accountId}|${date}|${amount}|${payee}`;
  return createHash('sha256').update(input).digest('hex');
}

export function createMockSimpleFINClient(): SimpleFINClient {
  const fixturePath = join(import.meta.dirname, 'fixtures', 'simplefin-response.json');
  const fixtureData: SimpleFINAccountSet = JSON.parse(readFileSync(fixturePath, 'utf-8'));

  return {
    async fetchAccounts(): Promise<SimpleFINAccountSet> {
      return fixtureData;
    },
    async fetchTransactions(startDate?: number, endDate?: number): Promise<SimpleFINAccountSet> {
      if (!startDate && !endDate) return fixtureData;

      const filtered = {
        ...fixtureData,
        accounts: fixtureData.accounts.map(account => ({
          ...account,
          transactions: account.transactions.filter(txn => {
            const ts = txn.posted || txn.transacted_at || 0;
            if (startDate && ts < startDate) return false;
            if (endDate && ts >= endDate) return false;
            return true;
          }),
        })),
      };
      return filtered;
    },
    async fetchBalances(): Promise<SimpleFINAccountSet> {
      return {
        ...fixtureData,
        accounts: fixtureData.accounts.map(account => ({
          ...account,
          transactions: [],
        })),
      };
    },
  };
}

export function createSimpleFINClient(accessUrl: string): SimpleFINClient {
  async function fetchFromApi(params?: Record<string, string>): Promise<SimpleFINAccountSet> {
    const parsed = new URL(accessUrl);
    const username = parsed.username;
    const password = parsed.password;
    parsed.username = '';
    parsed.password = '';

    const base = parsed.toString().replace(/\/$/, '');
    const url = new URL(`${base}/accounts`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }

    const headers: Record<string, string> = { 'Accept': 'application/json' };
    if (username || password) {
      headers['Authorization'] = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
    }

    const response = await fetch(url.toString(), { headers });

    if (response.status === 403) {
      throw new Error('SimpleFIN access revoked or credentials invalid');
    }
    if (response.status === 402) {
      throw new Error('SimpleFIN payment required');
    }
    if (!response.ok) {
      throw new Error(`SimpleFIN API error: ${response.status}`);
    }

    return response.json();
  }

  return {
    async fetchAccounts(): Promise<SimpleFINAccountSet> {
      return fetchFromApi();
    },
    async fetchTransactions(startDate?: number, endDate?: number): Promise<SimpleFINAccountSet> {
      const params: Record<string, string> = {};
      if (startDate) params['start-date'] = String(startDate);
      if (endDate) params['end-date'] = String(endDate);
      return fetchFromApi(params);
    },
    async fetchBalances(): Promise<SimpleFINAccountSet> {
      return fetchFromApi({ 'balances-only': '1' });
    },
  };
}

export async function claimToken(setupToken: string): Promise<string> {
  const claimUrl = Buffer.from(setupToken, 'base64').toString('utf-8');

  const response = await fetch(claimUrl, { method: 'POST' });

  if (response.status === 403) {
    throw new Error('SimpleFIN token invalid or already claimed — credentials may be compromised');
  }
  if (!response.ok) {
    throw new Error(`SimpleFIN claim failed: ${response.status}`);
  }

  return response.text();
}

export function getSimpleFINClient(): SimpleFINClient {
  if (process.env.SIMPLEFIN_MOCK === 'true') {
    return createMockSimpleFINClient();
  }
  const accessUrl = process.env.SIMPLEFIN_ACCESS_URL;
  if (!accessUrl) {
    throw new Error('SIMPLEFIN_ACCESS_URL environment variable is required');
  }
  return createSimpleFINClient(accessUrl);
}
