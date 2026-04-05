export function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

export interface ParsedPayee {
  displayName: string;
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

export function parsePayee(rawPayee: string): ParsedPayee {
  const match = rawPayee.match(prefixPattern);
  if (match) {
    const remainder = rawPayee.slice(match[0].length).trim();
    if (remainder) {
      return { displayName: remainder, prefix: match[1] };
    }
  }
  return { displayName: rawPayee, prefix: null };
}

export function formatShortDate(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
