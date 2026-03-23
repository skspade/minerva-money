import { describe, it, expect } from 'vitest';
import { groupCategories } from './BudgetPage';

const makeCategory = (
  id: number,
  name: string,
  group: string,
  allocated: number,
  spent: number,
) => ({
  categoryId: id,
  categoryName: name,
  groupName: group,
  allocated,
  spent,
  available: allocated - spent,
  rollover: 0,
});

describe('groupCategories', () => {
  const groceries = makeCategory(1, 'Groceries', 'Essentials', 50000, 30000);
  const utilities = makeCategory(2, 'Utilities', 'Essentials', 20000, 15000);
  const dining = makeCategory(3, 'Dining', 'Fun', 10000, 8000);

  it('groups categories by groupName', () => {
    const groups = groupCategories([groceries, utilities, dining]);
    expect(groups).toHaveLength(2);
    expect(groups[0].name).toBe('Essentials');
    expect(groups[0].categories).toHaveLength(2);
    expect(groups[1].name).toBe('Fun');
    expect(groups[1].categories).toHaveLength(1);
  });

  it('computes totalAllocated, totalSpent, totalAvailable', () => {
    const groups = groupCategories([groceries, utilities]);
    expect(groups[0].totalAllocated).toBe(70000);
    expect(groups[0].totalSpent).toBe(45000);
    expect(groups[0].totalAvailable).toBe(25000);
  });

  it('computes totalDefault as zero when no defaultsMap provided', () => {
    const groups = groupCategories([groceries, utilities]);
    expect(groups[0].totalDefault).toBe(0);
  });

  it('computes totalDefault from defaultsMap', () => {
    const defaultsMap = new Map([
      [1, 50000],
      [2, 20000],
    ]);
    const groups = groupCategories([groceries, utilities], defaultsMap);
    expect(groups[0].totalDefault).toBe(70000);
  });

  it('computes totalDefault with partial defaults (some categories have no default)', () => {
    const defaultsMap = new Map([[1, 50000]]);
    const groups = groupCategories([groceries, utilities, dining], defaultsMap);
    expect(groups[0].totalDefault).toBe(50000);
    expect(groups[1].totalDefault).toBe(0);
  });

  it('returns empty array for empty input', () => {
    expect(groupCategories([])).toEqual([]);
  });
});
