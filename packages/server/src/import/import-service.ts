import { parse } from 'csv-parse/sync';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { toCents } from '@minerva/shared';
import type { Cents } from '@minerva/shared';
import { generateDedupHash } from '../sync/simplefin-client.js';
import { categorizeNewTransactions } from '../rules/rules-service.js';
import { detectTransferCandidates } from '../transfers/transfer-service.js';
import { recalculateBalance } from '../accounts/accounts-service.js';

// --- Types ---

export interface RawCsvRow {
  Date: string;
  Merchant: string;
  Category: string;
  Account: string;
  'Original Statement': string;
  Notes: string;
  Amount: string;
  Tags?: string;
}

export interface TransformedRow {
  date: string;
  amount: Cents;
  payee: string;
  memo: string | null;
  merchantName: string;
  categoryName: string;
  accountName: string;
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

// --- Required Monarch columns ---

const REQUIRED_COLUMNS = ['Date', 'Merchant', 'Category', 'Account', 'Original Statement', 'Amount'];

// --- Bank statement columns (e.g., Discover) ---

const BANK_STATEMENT_COLUMNS = ['Transaction Date', 'Transaction Description', 'Debit', 'Credit'];

function parseCurrencyAmount(value: string): number {
  const cleaned = value.replace(/[$,]/g, '').trim();
  if (!cleaned || cleaned === '0') return 0;
  return parseFloat(cleaned);
}

interface BankStatementRow {
  'Transaction Date': string;
  'Transaction Description': string;
  'Transaction Type'?: string;
  Debit: string;
  Credit: string;
  Balance?: string;
}

function normalizeBankStatementRows(rows: BankStatementRow[]): RawCsvRow[] {
  return rows.map(row => {
    const debit = parseCurrencyAmount(row.Debit);
    const credit = parseCurrencyAmount(row.Credit);
    // Debits are money out (negative), credits are money in (positive)
    const amount = credit > 0 ? credit : -debit;
    const description = (row['Transaction Description'] || '').trim();

    return {
      Date: (row['Transaction Date'] || '').trim(),
      Merchant: description,
      Category: '',
      Account: 'Bank Statement',
      'Original Statement': description,
      Notes: '',
      Amount: String(amount),
    };
  });
}

// --- Date Parsing ---

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const US_DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

export function parseDate(dateStr: string): string | null {
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  // ISO format: YYYY-MM-DD
  const isoMatch = trimmed.match(ISO_DATE_RE);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const m = parseInt(month, 10);
    const d = parseInt(day, 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${year}-${month}-${day}`;
    }
    return null;
  }

  // US format: M/D/YYYY or MM/DD/YYYY
  const usMatch = trimmed.match(US_DATE_RE);
  if (usMatch) {
    const [, monthStr, dayStr, year] = usMatch;
    const m = parseInt(monthStr, 10);
    const d = parseInt(dayStr, 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    return null;
  }

  return null;
}

// --- CSV Parsing ---

export function parseCsv(csvText: string): RawCsvRow[] {
  // Strip UTF-8 BOM
  let text = csvText.replace(/^\uFEFF/, '');

  // Normalize CRLF to LF before delimiter detection
  text = text.replace(/\r\n/g, '\n');

  // Auto-detect delimiter: check first line for tab
  const firstLine = text.split('\n')[0];
  const delimiter = firstLine.includes('\t') ? '\t' : ',';

  // Detect format from header columns
  const headerCols = firstLine.split(delimiter).map(c => c.trim());
  const isBankStatement = BANK_STATEMENT_COLUMNS.every(col => headerCols.includes(col));

  if (isBankStatement) {
    const bankRows = parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      bom: true,
      delimiter,
    }) as BankStatementRow[];
    return normalizeBankStatementRows(bankRows);
  }

  const rows = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    bom: true,
    delimiter,
  }) as RawCsvRow[];

  // Validate required columns exist
  if (rows.length > 0) {
    const columns = Object.keys(rows[0]);
    const missingColumns = REQUIRED_COLUMNS.filter(col => !columns.includes(col));
    if (missingColumns.length > 0) {
      throw new Error(`Missing required columns: ${missingColumns.join(', ')}`);
    }
  } else {
    // Parse header only to check columns
    const headerRow = parse(text, {
      columns: true,
      to: 1,
      trim: true,
      bom: true,
      delimiter,
    }) as Record<string, string>[];

    if (headerRow.length === 0) {
      // Try to get columns from an empty parse
      const headerOnly = parse(text, {
        columns: true,
        trim: true,
        bom: true,
        delimiter,
      }) as Record<string, string>[];
      if (headerOnly.length === 0) {
        // Check the header line directly
        const headerCols2 = firstLine.split(delimiter).map(c => c.trim());
        const missingColumns = REQUIRED_COLUMNS.filter(col => !headerCols2.includes(col));
        if (missingColumns.length > 0) {
          throw new Error(`Missing required columns: ${missingColumns.join(', ')}`);
        }
      }
    }
  }

  return rows;
}

// --- Row Validation ---

export function validateRow(row: RawCsvRow, rowNumber: number): ValidationResult {
  const errors: string[] = [];

  // Check date
  const dateTrimmed = (row.Date || '').trim();
  if (!dateTrimmed) {
    errors.push(`Row ${rowNumber}: missing date`);
  } else if (parseDate(dateTrimmed) === null) {
    errors.push(`Row ${rowNumber}: invalid date format "${dateTrimmed}"`);
  }

  // Check amount
  const amountTrimmed = (row.Amount || '').trim();
  if (!amountTrimmed) {
    errors.push(`Row ${rowNumber}: missing amount`);
  } else if (isNaN(parseFloat(amountTrimmed))) {
    errors.push(`Row ${rowNumber}: invalid amount "${amountTrimmed}"`);
  }

  // Check account
  const accountTrimmed = (row.Account || '').trim();
  if (!accountTrimmed) {
    errors.push(`Row ${rowNumber}: missing account`);
  }

  // Check merchant / original statement (at least one required)
  const merchantTrimmed = (row.Merchant || '').trim();
  const origStmtTrimmed = (row['Original Statement'] || '').trim();
  if (!merchantTrimmed && !origStmtTrimmed) {
    errors.push(`Row ${rowNumber}: missing merchant and original statement (at least one required for dedup)`);
  }

  return errors.length > 0 ? { valid: false, errors } : { valid: true };
}

// --- Row Transformation ---

export function transformRow(row: RawCsvRow): TransformedRow {
  const date = parseDate(row.Date.trim())!;
  const amount = toCents(parseFloat(row.Amount.trim()));

  const origStmt = (row['Original Statement'] || '').trim();
  const merchant = (row.Merchant || '').trim();
  const payee = origStmt || merchant;

  const notesTrimmed = (row.Notes || '').trim();
  const memo = notesTrimmed || null;

  return {
    date,
    amount,
    payee,
    memo,
    merchantName: merchant,
    categoryName: (row.Category || '').trim(),
    accountName: (row.Account || '').trim(),
  };
}

// --- Preview & Execute Types ---

export interface AccountMatch {
  csvName: string;
  suggestedId: string | null;
  suggestedName: string | null;
}

export interface CategoryMatch {
  csvName: string;
  suggestedId: number | null;
  suggestedName: string | null;
}

export interface PreviewResult {
  totalRows: number;
  validRows: number;
  sampleRows: TransformedRow[];
  errors: string[];
  accounts: AccountMatch[];
  categories: CategoryMatch[];
  rowCountByAccount: Record<string, number>;
  dedupStats: {
    newCount: number;
    duplicateCount: number;
  };
}

export interface ExecuteResult {
  importedCount: number;
  skippedCount: number;
  skippedByAccountFilter: number;
  categorizedByRules: number;
  categorizedFromCsv: number;
  recalculatedAccounts: number;
}

// --- Preview ---

export function previewImport(db: Database.Database, csvText: string): PreviewResult {
  const rawRows = parseCsv(csvText);
  const allErrors: string[] = [];
  const validTransformed: TransformedRow[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const rowNumber = i + 2; // 1-based, row 1 is header
    const validation = validateRow(rawRows[i], rowNumber);
    if (validation.valid) {
      validTransformed.push(transformRow(rawRows[i]));
    } else {
      allErrors.push(...validation.errors!);
    }
  }

  // Per-account row counts (valid rows only)
  const rowCountByAccount: Record<string, number> = {};
  for (const row of validTransformed) {
    rowCountByAccount[row.accountName] = (rowCountByAccount[row.accountName] || 0) + 1;
  }

  // Unique account names
  const uniqueAccounts = [...new Set(validTransformed.map(r => r.accountName))];
  // Unique category names (exclude empty)
  const uniqueCategories = [...new Set(validTransformed.map(r => r.categoryName).filter(Boolean))];

  // Auto-match accounts: case-insensitive substring
  const dbAccounts = db.prepare('SELECT id, name FROM accounts').all() as { id: string; name: string }[];
  const accountMatches: AccountMatch[] = uniqueAccounts.map(csvName => {
    const csvLower = csvName.toLowerCase();
    const match = dbAccounts.find(a => {
      const dbLower = a.name.toLowerCase();
      return dbLower.includes(csvLower) || csvLower.includes(dbLower);
    });
    return {
      csvName,
      suggestedId: match?.id ?? null,
      suggestedName: match?.name ?? null,
    };
  });

  // Auto-match categories: exact case-insensitive
  const dbCategories = db.prepare('SELECT id, name FROM categories').all() as { id: number; name: string }[];
  const categoryMatches: CategoryMatch[] = uniqueCategories.map(csvName => {
    const csvLower = csvName.toLowerCase();
    const match = dbCategories.find(c => c.name.toLowerCase() === csvLower);
    return {
      csvName,
      suggestedId: match?.id ?? null,
      suggestedName: match?.name ?? null,
    };
  });

  // Dedup stats: compute hashes for rows with matched accounts
  const accountIdMap = new Map(accountMatches.filter(a => a.suggestedId).map(a => [a.csvName, a.suggestedId!]));
  let duplicateCount = 0;
  let newCount = 0;

  // Collect hashes for rows with matched accounts
  const hashesToCheck: string[] = [];
  const rowsWithHashes: { hash: string; hasMappedAccount: boolean }[] = [];

  for (const row of validTransformed) {
    const accountId = accountIdMap.get(row.accountName);
    if (accountId) {
      const hash = generateDedupHash(accountId, row.date, row.amount, row.payee);
      hashesToCheck.push(hash);
      rowsWithHashes.push({ hash, hasMappedAccount: true });
    } else {
      rowsWithHashes.push({ hash: '', hasMappedAccount: false });
    }
  }

  // Batch-check existing hashes
  const existingHashes = new Set<string>();
  if (hashesToCheck.length > 0) {
    // Process in chunks to avoid SQLite parameter limit
    const CHUNK_SIZE = 500;
    for (let i = 0; i < hashesToCheck.length; i += CHUNK_SIZE) {
      const chunk = hashesToCheck.slice(i, i + CHUNK_SIZE);
      const placeholders = chunk.map(() => '?').join(', ');
      const rows = db.prepare(
        `SELECT dedup_hash FROM transactions WHERE dedup_hash IN (${placeholders})`
      ).all(...chunk) as { dedup_hash: string }[];
      for (const r of rows) {
        existingHashes.add(r.dedup_hash);
      }
    }
  }

  for (const entry of rowsWithHashes) {
    if (!entry.hasMappedAccount) {
      newCount++; // Conservative: unmapped accounts counted as new
    } else if (existingHashes.has(entry.hash)) {
      duplicateCount++;
    } else {
      newCount++;
    }
  }

  return {
    totalRows: rawRows.length,
    validRows: validTransformed.length,
    sampleRows: validTransformed.slice(0, 10),
    errors: allErrors,
    accounts: accountMatches,
    categories: categoryMatches,
    rowCountByAccount,
    dedupStats: { newCount, duplicateCount },
  };
}

// --- Execute ---

export function executeImport(
  db: Database.Database,
  csvText: string,
  accountMappings: Record<string, string>,
  categoryMappings: Record<string, number>,
): ExecuteResult {
  // Parse and validate
  const rawRows = parseCsv(csvText);
  const validTransformed: TransformedRow[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const rowNumber = i + 2;
    const validation = validateRow(rawRows[i], rowNumber);
    if (validation.valid) {
      validTransformed.push(transformRow(rawRows[i]));
    }
  }

  // Execute atomically
  const result = db.transaction(() => {
    const txnStmt = db.prepare(`
      INSERT OR IGNORE INTO transactions (id, account_id, date, amount, pending, payee, memo, dedup_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let importedCount = 0;
    let skippedCount = 0;
    let skippedByAccountFilter = 0;
    const newTransactionIds: string[] = [];
    const newTxnCategoryMap: Map<string, number> = new Map(); // txnId -> categoryId from CSV

    for (const row of validTransformed) {
      const accountId = accountMappings[row.accountName];
      if (!accountId) {
        skippedByAccountFilter++;
        continue;
      }
      const dedupHash = generateDedupHash(accountId, row.date, row.amount, row.payee);
      const txnId = randomUUID();

      const info = txnStmt.run(
        txnId, accountId, row.date, row.amount, 0, row.payee, row.memo, dedupHash,
      );

      if (info.changes > 0) {
        importedCount++;
        newTransactionIds.push(txnId);

        // Track CSV category mapping for fallback
        const categoryId = categoryMappings[row.categoryName];
        if (categoryId !== undefined) {
          newTxnCategoryMap.set(txnId, categoryId);
        }
      } else {
        skippedCount++;
      }
    }

    // Post-insert hooks
    let categorizedByRules = 0;
    let categorizedFromCsv = 0;

    if (newTransactionIds.length > 0) {
      // 1. Rules engine first
      categorizeNewTransactions(db, newTransactionIds);

      // 2. CSV category fallback — only for transactions still uncategorized after rules
      const fallbackStmt = db.prepare(
        `UPDATE transactions SET category_id = ? WHERE id = ? AND category_id IS NULL`
      );
      for (const [txnId, categoryId] of newTxnCategoryMap) {
        const updateInfo = fallbackStmt.run(categoryId, txnId);
        if (updateInfo.changes > 0) {
          categorizedFromCsv++;
        }
      }

      // Count rules-categorized: transactions with non-null rule_id
      const placeholders = newTransactionIds.map(() => '?').join(', ');
      const rulesCategorized = db.prepare(
        `SELECT COUNT(*) as count FROM transactions WHERE id IN (${placeholders}) AND rule_id IS NOT NULL`
      ).get(...newTransactionIds) as { count: number };
      categorizedByRules = rulesCategorized.count;

      // 3. Transfer detection
      detectTransferCandidates(db, newTransactionIds);
    }

    // 4. Recalculate balance for manual accounts that received transactions
    const importedAccountIds = new Set(
      validTransformed
        .map(row => accountMappings[row.accountName])
        .filter((id): id is string => id !== undefined),
    );

    let recalculatedAccounts = 0;
    for (const accountId of importedAccountIds) {
      const account = db.prepare('SELECT source FROM accounts WHERE id = ?').get(accountId) as { source: string } | undefined;
      if (account?.source === 'manual') {
        recalculateBalance(db, accountId);
        recalculatedAccounts++;
      }
    }

    return { importedCount, skippedCount, skippedByAccountFilter, categorizedByRules, categorizedFromCsv, recalculatedAccounts };
  })();

  return result;
}
