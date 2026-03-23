-- Rules engine: add match_type to categorization_rules and rule_id to transactions.

ALTER TABLE categorization_rules ADD COLUMN match_type TEXT NOT NULL DEFAULT 'contains';
ALTER TABLE transactions ADD COLUMN rule_id INTEGER REFERENCES categorization_rules(id) ON DELETE SET NULL;
CREATE INDEX idx_transactions_rule_id ON transactions(rule_id);
