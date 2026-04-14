import type Database from 'better-sqlite3';
import BetterSqlite3 from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface BackupResult {
  path: string;
  timestamp: string;
  sizeBytes: number;
  integrityOk: boolean;
  isCloudBackup: boolean;
}

const ICLOUD_PARENT = path.join(
  'Library',
  'Mobile Documents',
  'com~apple~CloudDrive'
);

const RETENTION_DAYS = 30;

export function resolveBackupDir(homeDir?: string): { dir: string; isCloud: boolean } {
  const home = homeDir ?? os.homedir();
  const iCloudDir = path.join(home, ICLOUD_PARENT);

  if (fs.existsSync(iCloudDir)) {
    return { dir: path.join(iCloudDir, 'MinervaBackups'), isCloud: true };
  }

  return { dir: path.join(home, 'minerva-money', 'backups'), isCloud: false };
}

function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

export async function createBackup(
  db: Database.Database,
  backupDir?: string
): Promise<BackupResult> {
  let dir: string;
  let isCloudBackup: boolean;

  if (backupDir) {
    dir = backupDir;
    isCloudBackup = false;
  } else {
    const resolved = resolveBackupDir();
    dir = resolved.dir;
    isCloudBackup = resolved.isCloud;
  }

  console.log(`Backup target: ${dir} (${isCloudBackup ? 'iCloud' : 'local'})`);
  fs.mkdirSync(dir, { recursive: true });

  const timestamp = formatTimestamp(new Date());
  const filename = `minerva_${timestamp}.db`;
  const backupPath = path.join(dir, filename);
  const latestPath = path.join(dir, 'minerva_latest.db');

  await db.backup(backupPath);

  fs.copyFileSync(backupPath, latestPath);

  const backupDb = new BetterSqlite3(backupPath, { readonly: true });
  const integrityResult = backupDb.pragma('integrity_check', { simple: true }) as string;
  backupDb.close();

  if (integrityResult !== 'ok') {
    throw new Error(`Backup integrity check failed: ${integrityResult}`);
  }

  pruneOldBackups(dir);

  const stats = fs.statSync(backupPath);

  return {
    path: backupPath,
    timestamp,
    sizeBytes: stats.size,
    integrityOk: true,
    isCloudBackup,
  };
}

function pruneOldBackups(dir: string): void {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const files = fs.readdirSync(dir);

  for (const file of files) {
    if (!file.startsWith('minerva_') || !file.endsWith('.db') || file === 'minerva_latest.db') {
      continue;
    }

    const filePath = path.join(dir, file);
    const stats = fs.statSync(filePath);

    if (stats.mtimeMs < cutoff) {
      fs.unlinkSync(filePath);
    }
  }
}
