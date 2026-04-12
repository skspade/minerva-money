export function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

export interface ParsedPayee {
  displayName: string;
  rawDisplayName: string;
  prefix: string | null;
}

const BANKING_PREFIXES = [
  'Point Of Sale Withdrawal',
  'Point Of Sale Purchase',
  'Debit Card Purchase',
  'Recurring Payment',
  'External Withdrawal',
  'External Deposit',
  'Online Transfer',
  'Bill Payment',
  'ACH Withdrawal',
  'ACH Deposit',
  'ACH Credit',
  'ACH Debit',
  'ATM Withdrawal',
  'ATM Deposit',
  'Wire Transfer',
  'Wire Deposit',
  'Wire Withdrawal',
  'Check Withdrawal',
  'Dividend Credit',
  'Credit Interest',
];

const prefixPattern = new RegExp(
  `^(${BANKING_PREFIXES.join('|')})\\s+`,
  'i',
);

const MERCHANT_JUNK: [RegExp, string][] = [
  [/^(IC\*|SQ\s?\*|TST\*)\s*/i, ''],
  [/\w+\*\d+\s*/g, ''],
  [/\s*\d{3}[-.]?\d{3}[-.]?\d{4}\s*/g, ' '],
  [/\s+#?\d{3,}$/i, ''],
  [/\s{2,}/g, ' '],
];

function cleanMerchantName(name: string): string {
  let result = name;
  for (const [pattern, replacement] of MERCHANT_JUNK) {
    result = result.replace(pattern, replacement);
  }
  return result.trim();
}

function titleCase(str: string): string {
  if (str !== str.toUpperCase()) return str;
  return str.toLowerCase().replace(/(^|\s)\w/g, c => c.toUpperCase());
}

export function parsePayee(rawPayee: string): ParsedPayee {
  const match = rawPayee.match(prefixPattern);
  let rawDisplayName: string;
  let prefix: string | null;

  if (match) {
    const remainder = rawPayee.slice(match[0].length).trim();
    if (remainder) {
      rawDisplayName = remainder;
      prefix = match[1];
    } else {
      rawDisplayName = rawPayee;
      prefix = null;
    }
  } else {
    rawDisplayName = rawPayee;
    prefix = null;
  }

  const cleaned = cleanMerchantName(rawDisplayName);
  const displayName = titleCase(cleaned || rawDisplayName);

  return { displayName, rawDisplayName, prefix };
}

export function formatShortDate(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function formatRelativeDate(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00');
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays >= 2 && diffDays <= 6) {
    return d.toLocaleDateString('en-US', { weekday: 'long' });
  }
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
