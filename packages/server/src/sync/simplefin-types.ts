import type { Cents } from '@minerva/shared';

// SimpleFIN Protocol v2 raw API response types

export interface SimpleFINError {
  code: string;
  msg: string;
  conn_id?: string;
  account_id?: string;
}

export interface SimpleFINConnection {
  conn_id: string;
  name: string;
  org_id: string;
  org_url?: string;
  sfin_url: string;
}

export interface SimpleFINTransaction {
  id: string;
  posted: number;
  amount: string;
  description: string;
  transacted_at?: number;
  pending?: boolean;
  extra?: Record<string, unknown>;
}

export interface SimpleFINAccount {
  id: string;
  name: string;
  conn_id: string;
  currency: string;
  balance: string;
  'available-balance'?: string;
  'balance-date': number;
  transactions: SimpleFINTransaction[];
  extra?: Record<string, unknown>;
}

export interface SimpleFINAccountSet {
  errlist: SimpleFINError[];
  connections: SimpleFINConnection[];
  accounts: SimpleFINAccount[];
}

// App domain types (normalized)

export interface NormalizedAccount {
  id: string;
  name: string;
  institution: string;
  type: string;
  balance: Cents;
  currency: string;
  lastSynced: string;
}

export interface NormalizedTransaction {
  id: string;
  accountId: string;
  date: string;
  amount: Cents;
  pending: boolean;
  payee: string;
  memo: string;
  dedupHash: string;
}

// Client interface

export interface SimpleFINClient {
  fetchAccounts(): Promise<SimpleFINAccountSet>;
  fetchTransactions(startDate?: number, endDate?: number): Promise<SimpleFINAccountSet>;
  fetchBalances(): Promise<SimpleFINAccountSet>;
}
