import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createBackup } from './backup.js';

describe('run-backup entry point pattern', () => {
  let tmpDir: string;
  let backupDir: string;
  let dbPath: string;
  let db: Database.Database;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'minerva-run-backup-test-'));
    backupDir = path.join(tmpDir, 'backups');
    dbPath = path.join(tmpDir, 'test.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.exec('CREATE TABLE test_data (id INTEGER PRIMARY KEY, value TEXT);');
    db.prepare('INSERT INTO test_data (value) VALUES (?)').run('backup-test');
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates a backup using the same pattern as run-backup.ts', async () => {
    const result = await createBackup(db, backupDir);

    expect(result.path).toMatch(/minerva_\d{8}_\d{6}\.db$/);
    expect(result.integrityOk).toBe(true);
    expect(result.sizeBytes).toBeGreaterThan(0);
  });

  it('backup contains original data after open-backup-close cycle', async () => {
    const result = await createBackup(db, backupDir);
    db.close();

    const backupDb = new Database(result.path, { readonly: true });
    const rows = backupDb.prepare('SELECT value FROM test_data').all() as { value: string }[];
    backupDb.close();

    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe('backup-test');

    // Reopen for afterEach cleanup
    db = new Database(dbPath);
  });

  it('database closes cleanly after backup completes', async () => {
    await createBackup(db, backupDir);
    db.close();

    // Verify DB can be reopened (proves clean close)
    const reopened = new Database(dbPath, { readonly: true });
    const result = reopened.pragma('integrity_check', { simple: true }) as string;
    reopened.close();

    expect(result).toBe('ok');

    // Reopen for afterEach cleanup
    db = new Database(dbPath);
  });
});
