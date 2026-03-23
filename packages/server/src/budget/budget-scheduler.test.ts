import { describe, it, expect, afterEach } from 'vitest';
import { createDatabase } from '../db/connection.js';
import { startBudgetScheduler, stopBudgetScheduler } from './budget-scheduler.js';
import type Database from 'better-sqlite3';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';

describe('budget-scheduler', () => {
  let db: Database.Database;
  let tmpDir: string;

  afterEach(() => {
    stopBudgetScheduler();
    if (db) db.close();
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('starts and stops without errors', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'minerva-budget-sched-'));
    db = createDatabase(join(tmpDir, 'test.db'));

    expect(() => startBudgetScheduler(db)).not.toThrow();
    expect(() => stopBudgetScheduler()).not.toThrow();
  });

  it('can be stopped multiple times without error', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'minerva-budget-sched-'));
    db = createDatabase(join(tmpDir, 'test.db'));

    startBudgetScheduler(db);
    stopBudgetScheduler();
    expect(() => stopBudgetScheduler()).not.toThrow();
  });
});
