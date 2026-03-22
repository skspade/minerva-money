import Database from 'better-sqlite3';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { migrate } from './migrate.js';

const DEFAULT_DB_PATH = path.join(os.homedir(), 'minerva-money', 'data', 'minerva.db');
const DEFAULT_MIGRATIONS_DIR = path.join(import.meta.dirname, '../../migrations');

export function createDatabase(dbPath?: string, migrationsDir?: string): Database.Database {
  const resolvedPath = dbPath ?? DEFAULT_DB_PATH;

  const dir = path.dirname(resolvedPath);
  fs.mkdirSync(dir, { recursive: true });

  const db = new Database(resolvedPath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  migrate(db, migrationsDir ?? DEFAULT_MIGRATIONS_DIR);

  return db;
}
