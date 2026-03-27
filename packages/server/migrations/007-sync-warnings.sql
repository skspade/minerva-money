-- Sync warnings: one active warning per account (UPSERT-compatible)
CREATE TABLE sync_warnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_log_id INTEGER NOT NULL,
  account_id TEXT NOT NULL,
  account_name TEXT NOT NULL,
  error_code TEXT NOT NULL,
  message TEXT NOT NULL,
  first_seen TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen TEXT NOT NULL DEFAULT (datetime('now')),
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (sync_log_id) REFERENCES sync_log(id) ON DELETE CASCADE,
  UNIQUE(account_id)
);
