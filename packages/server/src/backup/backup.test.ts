import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createBackup, resolveBackupDir } from './backup.js';

describe('createBackup', () => {
  let tmpDir: string;
  let backupDir: string;
  let dbPath: string;
  let db: Database.Database;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'minerva-backup-test-'));
    backupDir = path.join(tmpDir, 'backups');
    dbPath = path.join(tmpDir, 'test.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.exec('CREATE TABLE test_data (id INTEGER PRIMARY KEY, value TEXT);');
    db.prepare('INSERT INTO test_data (value) VALUES (?)').run('hello');
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates a timestamped backup file', async () => {
    const result = await createBackup(db, backupDir);

    expect(result.path).toMatch(/minerva_\d{8}_\d{6}\.db$/);
    expect(fs.existsSync(result.path)).toBe(true);
    expect(result.sizeBytes).toBeGreaterThan(0);
  });

  it('creates minerva_latest.db alongside timestamped backup', async () => {
    await createBackup(db, backupDir);

    const latestPath = path.join(backupDir, 'minerva_latest.db');
    expect(fs.existsSync(latestPath)).toBe(true);
  });

  it('passes integrity check', async () => {
    const result = await createBackup(db, backupDir);
    expect(result.integrityOk).toBe(true);
  });

  it('creates backup directory if missing', async () => {
    const nestedDir = path.join(tmpDir, 'nested', 'backup', 'dir');
    const result = await createBackup(db, nestedDir);
    expect(fs.existsSync(result.path)).toBe(true);
  });

  it('returns correct BackupResult shape', async () => {
    const result = await createBackup(db, backupDir);

    expect(result).toHaveProperty('path');
    expect(result).toHaveProperty('timestamp');
    expect(result).toHaveProperty('sizeBytes');
    expect(result).toHaveProperty('integrityOk');
    expect(typeof result.path).toBe('string');
    expect(typeof result.timestamp).toBe('string');
    expect(typeof result.sizeBytes).toBe('number');
    expect(typeof result.integrityOk).toBe('boolean');
  });

  it('backup is a valid SQLite database with original data', async () => {
    const result = await createBackup(db, backupDir);

    const backupDb = new Database(result.path);
    const rows = backupDb.prepare('SELECT value FROM test_data').all() as { value: string }[];
    backupDb.close();

    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe('hello');
  });

  it('uses explicit backupDir when provided and sets isCloudBackup to false', async () => {
    const result = await createBackup(db, backupDir);
    expect(result.isCloudBackup).toBe(false);
  });

  it('returns correct BackupResult shape including isCloudBackup', async () => {
    const result = await createBackup(db, backupDir);
    expect(result).toHaveProperty('isCloudBackup');
    expect(typeof result.isCloudBackup).toBe('boolean');
  });

  it('prunes backups older than 30 days', async () => {
    fs.mkdirSync(backupDir, { recursive: true });

    // Create a fake old backup file
    const oldFile = path.join(backupDir, 'minerva_20260101_120000.db');
    fs.writeFileSync(oldFile, 'fake');
    // Set mtime to 31 days ago
    const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    fs.utimesSync(oldFile, oldDate, oldDate);

    // Create a recent fake backup
    const recentFile = path.join(backupDir, 'minerva_20260321_120000.db');
    fs.writeFileSync(recentFile, 'fake');

    await createBackup(db, backupDir);

    expect(fs.existsSync(oldFile)).toBe(false);
    expect(fs.existsSync(recentFile)).toBe(true);
  });
});

describe('resolveBackupDir', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'minerva-resolve-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns iCloud path when iCloud directory exists', () => {
    // Create fake iCloud Drive structure
    const iCloudParent = path.join(tmpDir, 'Library', 'Mobile Documents', 'com~apple~CloudDrive');
    fs.mkdirSync(iCloudParent, { recursive: true });

    const result = resolveBackupDir(tmpDir);
    expect(result.isCloud).toBe(true);
    expect(result.dir).toBe(path.join(iCloudParent, 'MinervaBackups'));
  });

  it('returns local fallback path when iCloud directory is missing', () => {
    // tmpDir has no Library/Mobile Documents structure
    const result = resolveBackupDir(tmpDir);
    expect(result.isCloud).toBe(false);
    expect(result.dir).toBe(path.join(tmpDir, 'minerva-money', 'backups'));
  });
});
