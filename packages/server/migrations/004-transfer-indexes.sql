-- Transfer detection performance indexes
CREATE INDEX IF NOT EXISTS idx_transfer_links_txn_a ON transfer_links(transaction_a_id);
CREATE INDEX IF NOT EXISTS idx_transfer_links_txn_b ON transfer_links(transaction_b_id);
CREATE INDEX IF NOT EXISTS idx_transfer_links_confirmed ON transfer_links(confirmed);
