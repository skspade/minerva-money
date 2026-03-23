import { describe, it, expect } from 'vitest';
import { filterTransactions, TransactionFilters } from './TransactionsPage';

const emptyFilters: TransactionFilters = {
  dateFrom: '',
  dateTo: '',
  search: '',
  amountMin: '',
  amountMax: '',
  categoryFilter: '',
};

const makeTxn = (
  overrides: Partial<{
    date: string;
    payee: string;
    memo: string | null;
    amount: number;
    categoryId: number | null;
  }> = {},
) => ({
  date: '2026-03-15',
  payee: 'Test Payee',
  memo: null as string | null,
  amount: -5000,
  categoryId: null as number | null,
  ...overrides,
});

describe('filterTransactions', () => {
  const txns = [
    makeTxn({ payee: 'Grocery Store', amount: -5000, categoryId: 1, date: '2026-03-10' }),
    makeTxn({ payee: 'Gas Station', amount: -3000, categoryId: 2, date: '2026-03-12' }),
    makeTxn({ payee: 'Salary', amount: 200000, categoryId: 3, date: '2026-03-15' }),
    makeTxn({ payee: 'Coffee Shop', amount: -450, categoryId: null, date: '2026-03-18' }),
    makeTxn({ payee: 'Refund', amount: 1500, categoryId: 1, date: '2026-03-20', memo: 'return item' }),
  ];

  it('returns all transactions with empty filters', () => {
    const result = filterTransactions(txns, emptyFilters);
    expect(result).toHaveLength(5);
  });

  it('filters by dateFrom', () => {
    const result = filterTransactions(txns, { ...emptyFilters, dateFrom: '2026-03-15' });
    expect(result).toHaveLength(3);
    expect(result.every(t => t.date >= '2026-03-15')).toBe(true);
  });

  it('filters by dateTo', () => {
    const result = filterTransactions(txns, { ...emptyFilters, dateTo: '2026-03-12' });
    expect(result).toHaveLength(2);
  });

  it('filters by search (payee)', () => {
    const result = filterTransactions(txns, { ...emptyFilters, search: 'grocery' });
    expect(result).toHaveLength(1);
    expect(result[0].payee).toBe('Grocery Store');
  });

  it('filters by search (memo)', () => {
    const result = filterTransactions(txns, { ...emptyFilters, search: 'return' });
    expect(result).toHaveLength(1);
    expect(result[0].payee).toBe('Refund');
  });

  it('filters by amountMin using absolute value', () => {
    const result = filterTransactions(txns, { ...emptyFilters, amountMin: '50' });
    expect(result).toHaveLength(2);
    expect(result.map(t => t.payee).sort()).toEqual(['Grocery Store', 'Salary']);
  });

  it('filters by amountMax using absolute value', () => {
    const result = filterTransactions(txns, { ...emptyFilters, amountMax: '10' });
    expect(result).toHaveLength(1);
    expect(result[0].payee).toBe('Coffee Shop');
  });

  it('filters by amount range (min and max together)', () => {
    const result = filterTransactions(txns, { ...emptyFilters, amountMin: '15', amountMax: '50' });
    expect(result).toHaveLength(3);
    expect(result.map(t => t.payee).sort()).toEqual(['Gas Station', 'Grocery Store', 'Refund']);
  });

  it('handles floating point cents conversion correctly', () => {
    const result = filterTransactions(
      [makeTxn({ amount: -1999 })],
      { ...emptyFilters, amountMin: '19.99' },
    );
    expect(result).toHaveLength(1);
  });

  it('filters by specific category', () => {
    const result = filterTransactions(txns, { ...emptyFilters, categoryFilter: '1' });
    expect(result).toHaveLength(2);
    expect(result.every(t => t.categoryId === 1)).toBe(true);
  });

  it('filters to uncategorized transactions', () => {
    const result = filterTransactions(txns, { ...emptyFilters, categoryFilter: 'uncategorized' });
    expect(result).toHaveLength(1);
    expect(result[0].payee).toBe('Coffee Shop');
    expect(result[0].categoryId).toBeNull();
  });

  it('combines all filters together', () => {
    const result = filterTransactions(txns, {
      dateFrom: '2026-03-01',
      dateTo: '2026-03-20',
      search: '',
      amountMin: '10',
      amountMax: '60',
      categoryFilter: '1',
    });
    expect(result).toHaveLength(2);
    expect(result.map(t => t.payee).sort()).toEqual(['Grocery Store', 'Refund']);
  });
});
