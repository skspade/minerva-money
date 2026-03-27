import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { migrate } from './migrate.js';

describe('migrate', () => {
  let tmpDir: string;
  let migrationsDir: string;
  let db: Database.Database;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'minerva-test-'));
    migrationsDir = path.join(tmpDir, 'migrations');
    fs.mkdirSync(migrationsDir);
    db = new Database(':memory:');
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('applies migrations and sets user_version', () => {
    fs.writeFileSync(
      path.join(migrationsDir, '001-create-test.sql'),
      'CREATE TABLE test_table (id INTEGER PRIMARY KEY, name TEXT);'
    );

    const count = migrate(db, migrationsDir);

    expect(count).toBe(1);
    expect(db.pragma('user_version', { simple: true })).toBe(1);

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    expect(tables.map(t => t.name)).toContain('test_table');
  });

  it('is idempotent -- running twice produces no errors', () => {
    fs.writeFileSync(
      path.join(migrationsDir, '001-create-test.sql'),
      'CREATE TABLE test_table (id INTEGER PRIMARY KEY);'
    );

    migrate(db, migrationsDir);
    const count = migrate(db, migrationsDir);

    expect(count).toBe(0);
    expect(db.pragma('user_version', { simple: true })).toBe(1);
  });

  it('applies only pending migrations on partially-migrated database', () => {
    fs.writeFileSync(
      path.join(migrationsDir, '001-first.sql'),
      'CREATE TABLE first_table (id INTEGER PRIMARY KEY);'
    );
    fs.writeFileSync(
      path.join(migrationsDir, '002-second.sql'),
      'CREATE TABLE second_table (id INTEGER PRIMARY KEY);'
    );

    migrate(db, migrationsDir);

    fs.writeFileSync(
      path.join(migrationsDir, '003-third.sql'),
      'CREATE TABLE third_table (id INTEGER PRIMARY KEY);'
    );

    const count = migrate(db, migrationsDir);

    expect(count).toBe(1);
    expect(db.pragma('user_version', { simple: true })).toBe(3);

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    expect(tables.map(t => t.name)).toContain('third_table');
  });

  it('handles empty migrations directory', () => {
    const count = migrate(db, migrationsDir);
    expect(count).toBe(0);
    expect(db.pragma('user_version', { simple: true })).toBe(0);
  });
});

describe('initial schema (001-initial-schema.sql)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    const schemaPath = path.join(import.meta.dirname, '../../migrations/001-initial-schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf-8');
    db.exec(sql);
    db.pragma('user_version = 1');
  });

  afterEach(() => {
    db.close();
  });

  const expectedTables = [
    'accounts',
    'transactions',
    'categories',
    'category_groups',
    'budget_allocations',
    'categorization_rules',
    'transfer_links',
    'balance_snapshots',
    'sync_log',
  ];

  it('creates all 9 tables', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[];
    const tableNames = tables.map(t => t.name);
    for (const expected of expectedTables) {
      expect(tableNames).toContain(expected);
    }
  });

  it('uses INTEGER type for all money columns', () => {
    const moneyColumns = [
      { table: 'accounts', column: 'balance' },
      { table: 'transactions', column: 'amount' },
      { table: 'budget_allocations', column: 'amount' },
      { table: 'categorization_rules', column: 'amount_min' },
      { table: 'categorization_rules', column: 'amount_max' },
      { table: 'balance_snapshots', column: 'balance' },
    ];

    for (const { table, column } of moneyColumns) {
      const info = db.pragma(`table_info(${table})`) as { name: string; type: string }[];
      const col = info.find(c => c.name === column);
      expect(col, `${table}.${column} should exist`).toBeDefined();
      expect(col!.type, `${table}.${column} should be INTEGER`).toBe('INTEGER');
    }
  });

  it('has UNIQUE constraint on transactions.id (transactionId primary key)', () => {
    db.prepare("INSERT INTO accounts (id, name, institution, type, balance, currency) VALUES ('acc1', 'Test', 'Bank', 'checking', 0, 'USD')").run();
    db.prepare("INSERT INTO transactions (id, account_id, date, amount, pending, payee) VALUES ('txn1', 'acc1', '2026-01-01', 1000, 0, 'Store')").run();

    expect(() => {
      db.prepare("INSERT INTO transactions (id, account_id, date, amount, pending, payee) VALUES ('txn1', 'acc1', '2026-01-02', 2000, 0, 'Other')").run();
    }).toThrow();
  });

  it('has UNIQUE index on transactions.dedup_hash for fallback dedup', () => {
    db.prepare("INSERT INTO accounts (id, name, institution, type, balance, currency) VALUES ('acc1', 'Test', 'Bank', 'checking', 0, 'USD')").run();
    db.prepare("INSERT INTO transactions (id, account_id, date, amount, pending, payee, dedup_hash) VALUES ('txn1', 'acc1', '2026-01-01', 1000, 0, 'Store', 'hash123')").run();

    expect(() => {
      db.prepare("INSERT INTO transactions (id, account_id, date, amount, pending, payee, dedup_hash) VALUES ('txn2', 'acc1', '2026-01-01', 1000, 0, 'Store', 'hash123')").run();
    }).toThrow();
  });
});

describe('migration 007 - sync_warnings', () => {
  let db: Database.Database;
  const migrationsDir = path.join(import.meta.dirname, '../../migrations');

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    migrate(db, migrationsDir);
  });

  afterEach(() => {
    db.close();
  });

  it('creates sync_warnings table', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[];
    expect(tables.map(t => t.name)).toContain('sync_warnings');
  });

  it('has all required columns with correct types', () => {
    const info = db.pragma('table_info(sync_warnings)') as { name: string; type: string; notnull: number; pk: number }[];

    const expected = [
      { name: 'id', type: 'INTEGER', notnull: 0, pk: 1 },
      { name: 'sync_log_id', type: 'INTEGER', notnull: 1, pk: 0 },
      { name: 'account_id', type: 'TEXT', notnull: 1, pk: 0 },
      { name: 'account_name', type: 'TEXT', notnull: 1, pk: 0 },
      { name: 'error_code', type: 'TEXT', notnull: 1, pk: 0 },
      { name: 'message', type: 'TEXT', notnull: 1, pk: 0 },
      { name: 'first_seen', type: 'TEXT', notnull: 1, pk: 0 },
      { name: 'last_seen', type: 'TEXT', notnull: 1, pk: 0 },
      { name: 'occurrence_count', type: 'INTEGER', notnull: 1, pk: 0 },
    ];

    for (const exp of expected) {
      const col = info.find(c => c.name === exp.name);
      expect(col, `${exp.name} should exist`).toBeDefined();
      expect(col!.type, `${exp.name} type`).toBe(exp.type);
      expect(col!.notnull, `${exp.name} notnull`).toBe(exp.notnull);
      expect(col!.pk, `${exp.name} pk`).toBe(exp.pk);
    }
  });

  it('cascades delete from sync_log to sync_warnings', () => {
    db.prepare("INSERT INTO sync_log (id, status) VALUES (1, 'completed')").run();
    db.prepare("INSERT INTO sync_warnings (sync_log_id, account_id, account_name, error_code, message) VALUES (1, 'acc1', 'Checking', 'ERR_001', 'Test error')").run();

    // Verify the warning exists
    const before = db.prepare("SELECT COUNT(*) as count FROM sync_warnings").get() as { count: number };
    expect(before.count).toBe(1);

    // Delete the sync_log entry
    db.prepare("DELETE FROM sync_log WHERE id = 1").run();

    // Warning should be cascade-deleted
    const after = db.prepare("SELECT COUNT(*) as count FROM sync_warnings").get() as { count: number };
    expect(after.count).toBe(0);
  });

  it('enforces UNIQUE constraint on account_id', () => {
    db.prepare("INSERT INTO sync_log (id, status) VALUES (1, 'completed')").run();
    db.prepare("INSERT INTO sync_warnings (sync_log_id, account_id, account_name, error_code, message) VALUES (1, 'acc1', 'Checking', 'ERR_001', 'First error')").run();

    expect(() => {
      db.prepare("INSERT INTO sync_warnings (sync_log_id, account_id, account_name, error_code, message) VALUES (1, 'acc1', 'Checking', 'ERR_002', 'Second error')").run();
    }).toThrow();
  });

  it('populates default values for first_seen, last_seen, and occurrence_count', () => {
    db.prepare("INSERT INTO sync_log (id, status) VALUES (1, 'completed')").run();
    db.prepare("INSERT INTO sync_warnings (sync_log_id, account_id, account_name, error_code, message) VALUES (1, 'acc1', 'Checking', 'ERR_001', 'Test error')").run();

    const row = db.prepare("SELECT first_seen, last_seen, occurrence_count FROM sync_warnings WHERE account_id = 'acc1'").get() as { first_seen: string; last_seen: string; occurrence_count: number };

    expect(row.first_seen).toBeTruthy();
    expect(row.last_seen).toBeTruthy();
    expect(row.occurrence_count).toBe(1);

    // Verify datetime format (YYYY-MM-DD HH:MM:SS)
    expect(row.first_seen).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(row.last_seen).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});
