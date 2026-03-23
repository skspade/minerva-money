import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '../trpc';
import { formatCurrency } from '../lib/format';

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getPreviousPeriod(period: string): string {
  const [year, month] = period.split('-').map(Number);
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
}

function getNextPeriod(period: string): string {
  const [year, month] = period.split('-').map(Number);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
}

function formatPeriodDisplay(period: string): string {
  const [year, month] = period.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

interface CategorySummary {
  categoryId: number;
  categoryName: string;
  groupName: string;
  allocated: number;
  spent: number;
  available: number;
  rollover: number;
}

interface GroupData {
  name: string;
  categories: CategorySummary[];
  totalAllocated: number;
  totalSpent: number;
  totalAvailable: number;
}

function groupCategories(categories: CategorySummary[]): GroupData[] {
  const groupMap = new Map<string, CategorySummary[]>();
  for (const cat of categories) {
    const existing = groupMap.get(cat.groupName) || [];
    existing.push(cat);
    groupMap.set(cat.groupName, existing);
  }

  const groups: GroupData[] = [];
  for (const [name, cats] of groupMap) {
    groups.push({
      name,
      categories: cats,
      totalAllocated: cats.reduce((sum, c) => sum + c.allocated, 0),
      totalSpent: cats.reduce((sum, c) => sum + c.spent, 0),
      totalAvailable: cats.reduce((sum, c) => sum + c.available, 0),
    });
  }
  return groups;
}

function availableColor(amount: number): string {
  if (amount < 0) return 'text-red-600 bg-red-50';
  if (amount > 0) return 'text-green-600';
  return 'text-gray-500';
}

function BudgetGroup({
  group,
  collapsed,
  onToggle,
}: {
  group: GroupData;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div
        className="grid grid-cols-4 gap-4 px-4 py-3 bg-gray-50 border-b border-gray-200 cursor-pointer"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          <span className="text-gray-500 text-xs w-4">
            {collapsed ? '\u25B8' : '\u25BE'}
          </span>
          <span className="font-semibold text-sm">{group.name}</span>
          <span className="text-xs text-gray-400">({group.categories.length})</span>
        </div>
        <div className="text-right text-sm font-medium">{formatCurrency(group.totalAllocated)}</div>
        <div className="text-right text-sm font-medium">{formatCurrency(group.totalSpent)}</div>
        <div className={`text-right text-sm font-medium rounded px-1 ${availableColor(group.totalAvailable)}`}>
          {formatCurrency(group.totalAvailable)}
        </div>
      </div>

      {!collapsed && (
        <div>
          {group.categories.map(cat => (
            <div
              key={cat.categoryId}
              className="grid grid-cols-4 gap-4 px-4 py-2 border-b border-gray-100 last:border-b-0"
            >
              <div className="text-sm pl-6">{cat.categoryName}</div>
              <div className="text-right text-sm">{formatCurrency(cat.allocated)}</div>
              <div className="text-right text-sm">{formatCurrency(cat.spent)}</div>
              <div className={`text-right text-sm rounded px-1 ${availableColor(cat.available)}`}>
                {formatCurrency(cat.available)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BudgetPage() {
  const trpc = useTRPC();
  const [period, setPeriod] = useState(getCurrentPeriod);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const { data, isLoading, error } = useQuery(
    trpc.budget.summary.queryOptions({ period }),
  );

  const toggleGroup = (groupName: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupName)) {
        next.delete(groupName);
      } else {
        next.add(groupName);
      }
      return next;
    });
  };

  if (isLoading) {
    return <p className="text-gray-500">Loading budget...</p>;
  }

  if (error) {
    return <p className="text-red-600">Error loading budget: {error.message}</p>;
  }

  const groups = data ? groupCategories(data.categories) : [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Budget</h2>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setPeriod(getPreviousPeriod(period))}
            className="px-3 py-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded"
          >
            &larr;
          </button>
          <span className="text-lg font-medium w-48 text-center">
            {formatPeriodDisplay(period)}
          </span>
          <button
            onClick={() => setPeriod(getNextPeriod(period))}
            className="px-3 py-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded"
          >
            &rarr;
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 px-4 py-2 text-xs text-gray-500 uppercase tracking-wide font-medium">
        <div>Category</div>
        <div className="text-right">Allocated</div>
        <div className="text-right">Spent</div>
        <div className="text-right">Available</div>
      </div>

      <div className="space-y-2">
        {groups.map(group => (
          <BudgetGroup
            key={group.name}
            group={group}
            collapsed={collapsedGroups.has(group.name)}
            onToggle={() => toggleGroup(group.name)}
          />
        ))}
      </div>

      {groups.length === 0 && (
        <p className="text-gray-500 mt-4">No budget categories found. Create categories first.</p>
      )}
    </div>
  );
}
