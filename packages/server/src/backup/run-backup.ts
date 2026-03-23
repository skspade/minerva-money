import Database from 'better-sqlite3';
import path from 'node:path';
import os from 'node:os';
import { createBackup } from './backup.js';

const DB_PATH = path.join(os.homedir(), 'minerva-money', 'data', 'minerva.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

try {
  const result = await createBackup(db);
  console.log(`Backup complete: ${result.path} (${result.sizeBytes} bytes, integrity: ${result.integrityOk})`);
} catch (error) {
  console.error('Backup failed:', error);
  process.exitCode = 1;
} finally {
  db.close();
}
