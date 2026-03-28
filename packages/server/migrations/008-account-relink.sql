-- Track previous SimpleFIN IDs when accounts are re-linked
CREATE TABLE account_id_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  previous_simplefin_id TEXT NOT NULL,
  replaced_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(previous_simplefin_id)
);
