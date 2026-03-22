import type Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export function migrate(db: Database.Database, migrationsDir: string): number {
  const currentVersion = db.pragma('user_version', { simple: true }) as number;

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  let applied = 0;

  for (const file of files) {
    const version = parseInt(file.split('-')[0], 10);
    if (isNaN(version) || version <= currentVersion) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

    db.transaction(() => {
      db.exec(sql);
      db.pragma(`user_version = ${version}`);
    })();

    applied++;
  }

  return applied;
}
