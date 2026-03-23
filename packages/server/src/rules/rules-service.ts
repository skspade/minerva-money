import type Database from 'better-sqlite3';

export interface RuleConditions {
  merchantPattern: string | null;
  matchType: 'exact' | 'contains';
  amountMin: number | null;
  amountMax: number | null;
  memoPattern: string | null;
}

export interface CreateRuleInput extends RuleConditions {
  name: string;
  categoryId: number;
}

export interface UpdateRuleInput extends CreateRuleInput {}

export interface Rule {
  id: number;
  name: string;
  merchantPattern: string | null;
  matchType: string;
  amountMin: number | null;
  amountMax: number | null;
  memoPattern: string | null;
  categoryId: number;
  specificityScore: number;
}

export interface RuleWithCategory extends Rule {
  categoryName: string;
}

interface RuleRow {
  id: number;
  name: string;
  merchant_pattern: string | null;
  match_type: string;
  amount_min: number | null;
  amount_max: number | null;
  memo_pattern: string | null;
  category_id: number;
  specificity_score: number;
  category_name?: string;
}

interface TransactionInput {
  payee: string | null;
  amount: number;
  memo: string | null;
}

interface MatchableRule {
  merchant_pattern: string | null;
  match_type: string;
  amount_min: number | null;
  amount_max: number | null;
  memo_pattern: string | null;
}

export function computeSpecificity(conditions: RuleConditions): number {
  let score = 0;
  if (conditions.merchantPattern) {
    score += conditions.matchType === 'exact' ? 3 : 2;
  }
  if (conditions.amountMin !== null && conditions.amountMax !== null) {
    score += 2;
  } else if (conditions.amountMin !== null || conditions.amountMax !== null) {
    score += 1;
  }
  if (conditions.memoPattern) {
    score += 1;
  }
  return score;
}

export function matchesRule(rule: MatchableRule, transaction: TransactionInput): boolean {
  if (rule.merchant_pattern) {
    if (!transaction.payee) return false;
    if (rule.match_type === 'exact') {
      if (transaction.payee.toLowerCase() !== rule.merchant_pattern.toLowerCase()) return false;
    } else {
      if (!transaction.payee.toLowerCase().includes(rule.merchant_pattern.toLowerCase())) return false;
    }
  }
  if (rule.amount_min !== null && Math.abs(transaction.amount) < rule.amount_min) return false;
  if (rule.amount_max !== null && Math.abs(transaction.amount) > rule.amount_max) return false;
  if (rule.memo_pattern) {
    if (!transaction.memo) return false;
    if (!transaction.memo.toLowerCase().includes(rule.memo_pattern.toLowerCase())) return false;
  }
  return true;
}

function rowToRule(row: RuleRow): Rule {
  return {
    id: row.id,
    name: row.name,
    merchantPattern: row.merchant_pattern,
    matchType: row.match_type,
    amountMin: row.amount_min,
    amountMax: row.amount_max,
    memoPattern: row.memo_pattern,
    categoryId: row.category_id,
    specificityScore: row.specificity_score,
  };
}

export function createRule(db: Database.Database, input: CreateRuleInput): Rule {
  const score = computeSpecificity(input);
  if (score === 0) {
    throw new Error('Rule must have at least one condition (merchant, amount range, or memo)');
  }

  const result = db.prepare(`
    INSERT INTO categorization_rules (name, merchant_pattern, match_type, amount_min, amount_max, memo_pattern, category_id, specificity_score)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.name,
    input.merchantPattern,
    input.matchType,
    input.amountMin,
    input.amountMax,
    input.memoPattern,
    input.categoryId,
    score,
  );

  return {
    id: Number(result.lastInsertRowid),
    name: input.name,
    merchantPattern: input.merchantPattern,
    matchType: input.matchType,
    amountMin: input.amountMin,
    amountMax: input.amountMax,
    memoPattern: input.memoPattern,
    categoryId: input.categoryId,
    specificityScore: score,
  };
}

export function updateRule(db: Database.Database, id: number, input: UpdateRuleInput): void {
  const score = computeSpecificity(input);
  if (score === 0) {
    throw new Error('Rule must have at least one condition (merchant, amount range, or memo)');
  }

  db.prepare(`
    UPDATE categorization_rules
    SET name = ?, merchant_pattern = ?, match_type = ?, amount_min = ?, amount_max = ?, memo_pattern = ?, category_id = ?, specificity_score = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    input.name,
    input.merchantPattern,
    input.matchType,
    input.amountMin,
    input.amountMax,
    input.memoPattern,
    input.categoryId,
    score,
    id,
  );
}

export function deleteRule(db: Database.Database, id: number): void {
  db.prepare('DELETE FROM categorization_rules WHERE id = ?').run(id);
}

export function listRules(db: Database.Database): RuleWithCategory[] {
  const rows = db.prepare(`
    SELECT cr.*, c.name AS category_name
    FROM categorization_rules cr
    JOIN categories c ON cr.category_id = c.id
    ORDER BY cr.specificity_score DESC, cr.id DESC
  `).all() as (RuleRow & { category_name: string })[];

  return rows.map(row => ({
    ...rowToRule(row),
    categoryName: row.category_name,
  }));
}

export function evaluateRules(db: Database.Database, transaction: TransactionInput): Rule | null {
  const rules = db.prepare(`
    SELECT * FROM categorization_rules
    ORDER BY specificity_score DESC, id DESC
  `).all() as RuleRow[];

  for (const rule of rules) {
    if (matchesRule(rule, transaction)) {
      return rowToRule(rule);
    }
  }
  return null;
}

export function categorizeNewTransactions(db: Database.Database, transactionIds: string[]): void {
  if (transactionIds.length === 0) return;

  const placeholders = transactionIds.map(() => '?').join(', ');
  const transactions = db.prepare(`
    SELECT t.id, t.payee, t.amount, t.memo, t.category_id, t.rule_id,
      (SELECT COUNT(*) FROM transaction_splits ts WHERE ts.transaction_id = t.id) AS split_count
    FROM transactions t
    WHERE t.id IN (${placeholders})
  `).all(...transactionIds) as {
    id: string;
    payee: string | null;
    amount: number;
    memo: string | null;
    category_id: number | null;
    rule_id: number | null;
    split_count: number;
  }[];

  const rules = db.prepare(`
    SELECT * FROM categorization_rules
    ORDER BY specificity_score DESC, id DESC
  `).all() as RuleRow[];

  const updateStmt = db.prepare('UPDATE transactions SET category_id = ?, rule_id = ? WHERE id = ?');

  db.transaction(() => {
    for (const txn of transactions) {
      // Skip manually categorized (category_id set but no rule_id)
      if (txn.category_id !== null && txn.rule_id === null) continue;
      // Skip transactions with splits
      if (txn.split_count > 0) continue;

      for (const rule of rules) {
        if (matchesRule(rule, txn)) {
          updateStmt.run(rule.category_id, rule.id, txn.id);
          break;
        }
      }
    }
  })();
}
