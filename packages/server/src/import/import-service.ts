import { parse } from 'csv-parse/sync';
import { toCents } from '@minerva/shared';
import type { Cents } from '@minerva/shared';

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
        const headerCols = firstLine.split(delimiter).map(c => c.trim());
        const missingColumns = REQUIRED_COLUMNS.filter(col => !headerCols.includes(col));
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
