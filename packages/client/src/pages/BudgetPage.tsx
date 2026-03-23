import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  totalDefault: number;
}

export function groupCategories(
  categories: CategorySummary[],
  defaultsMap?: Map<number, number>,
): GroupData[] {
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
      totalDefault: cats.reduce(
        (sum, c) => sum + (defaultsMap?.get(c.categoryId) ?? 0),
        0,
      ),
    });
  }
  return groups;
}

function availableColor(amount: number): string {
  if (amount < 0) return 'text-red-600 bg-red-50';
  if (amount > 0) return 'text-green-600';
  return 'text-gray-500';
}

function AllocationCell({
  value,
  onSave,
}: {
  value: number;
  onSave: (cents: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const startEditing = () => {
    setText((value / 100).toFixed(2));
    setEditing(true);
  };

  const save = () => {
    const parsed = parseFloat(text);
    if (isNaN(parsed)) {
      setEditing(false);
      return;
    }
    const cents = Math.round(parsed * 100);
    onSave(cents);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      save();
    } else if (e.key === 'Escape') {
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={save}
        className="w-24 px-2 py-1 border border-blue-400 rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    );
  }

  return (
    <span
      className="cursor-pointer hover:text-blue-600 hover:underline"
      onClick={startEditing}
      title="Click to edit allocation"
    >
      {formatCurrency(value)}
    </span>
  );
}

function BudgetGroup({
  group,
  collapsed,
  onToggle,
  period,
  onSetAllocation,
  defaultsMap,
  onSetDefault,
}: {
  group: GroupData;
  collapsed: boolean;
  onToggle: () => void;
  period: string;
  onSetAllocation: (categoryId: number, period: string, amount: number) => void;
  defaultsMap: Map<number, number>;
  onSetDefault: (categoryId: number, cents: number) => void;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div
        className="grid grid-cols-5 gap-4 px-4 py-3 bg-gray-50 border-b border-gray-200 cursor-pointer"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          <span className="text-gray-500 text-xs w-4">
            {collapsed ? '\u25B8' : '\u25BE'}
          </span>
          <span className="font-semibold text-sm">{group.name}</span>
          <span className="text-xs text-gray-400">({group.categories.length})</span>
        </div>
        <div className={`text-right text-sm font-medium ${group.totalDefault === 0 ? 'text-gray-400' : ''}`}>
          {formatCurrency(group.totalDefault)}
        </div>
        <div className="text-right text-sm font-medium">{formatCurrency(group.totalAllocated)}</div>
        <div className="text-right text-sm font-medium">{formatCurrency(group.totalSpent)}</div>
        <div className={`text-right text-sm font-medium rounded px-1 ${availableColor(group.totalAvailable)}`}>
          {formatCurrency(group.totalAvailable)}
        </div>
      </div>

      {!collapsed && (
        <div>
          {group.categories.map(cat => {
            const hasDefault = defaultsMap.has(cat.categoryId);
            const defaultValue = defaultsMap.get(cat.categoryId) ?? 0;
            return (
              <div
                key={cat.categoryId}
                className="grid grid-cols-5 gap-4 px-4 py-2 border-b border-gray-100 last:border-b-0"
              >
                <div className="text-sm pl-6">{cat.categoryName}</div>
                <div className={`text-right text-sm ${!hasDefault ? 'text-gray-400' : ''}`}>
                  <AllocationCell
                    value={defaultValue}
                    onSave={cents => onSetDefault(cat.categoryId, cents)}
                  />
                </div>
                <div className="text-right text-sm">
                  <AllocationCell
                    value={cat.allocated}
                    onSave={cents => onSetAllocation(cat.categoryId, period, cents)}
                  />
                </div>
                <div className="text-right text-sm">{formatCurrency(cat.spent)}</div>
                <div className={`text-right text-sm rounded px-1 ${availableColor(cat.available)}`}>
                  {formatCurrency(cat.available)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function BudgetPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState(getCurrentPeriod);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery(
    trpc.budget.summary.queryOptions({ period }),
  );

  const { data: defaults } = useQuery(
    trpc.budget.defaults.list.queryOptions(),
  );

  const defaultsMap = new Map(
    (defaults ?? []).map(d => [d.categoryId, d.amount]),
  );

  const setAllocationMut = useMutation(
    trpc.budget.allocations.set.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.budget.summary.queryKey() });
      },
      onError: (err) => {
        setErrorMessage(err.message);
        setTimeout(() => setErrorMessage(null), 3000);
        queryClient.invalidateQueries({ queryKey: trpc.budget.summary.queryKey() });
      },
    }),
  );

  const setDefaultMut = useMutation(
    trpc.budget.defaults.set.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.budget.defaults.list.queryKey() });
      },
      onError: (err) => {
        setErrorMessage(err.message);
        setTimeout(() => setErrorMessage(null), 3000);
      },
    }),
  );

  const deleteDefaultMut = useMutation(
    trpc.budget.defaults.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.budget.defaults.list.queryKey() });
      },
      onError: (err) => {
        setErrorMessage(err.message);
        setTimeout(() => setErrorMessage(null), 3000);
      },
    }),
  );

  const handleSetAllocation = (categoryId: number, p: string, amount: number) => {
    setAllocationMut.mutate({ categoryId, period: p, amount });
  };

  const handleSetDefault = (categoryId: number, cents: number) => {
    if (cents === 0) {
      deleteDefaultMut.mutate({ categoryId });
    } else {
      setDefaultMut.mutate({ categoryId, amount: cents });
    }
  };

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

  const groups = data ? groupCategories(data.categories, defaultsMap) : [];

  return (
    <div>
      {errorMessage && (
        <div className="mb-4 p-2 text-red-600 bg-red-50 rounded text-sm">
          Error saving: {errorMessage}
        </div>
      )}

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

      {data && (
        <div className="mb-6 p-4 bg-white rounded-lg border border-gray-200">
          <div className="text-sm text-gray-500 uppercase tracking-wide font-medium mb-1">
            Available to Budget
          </div>
          <div className={`text-3xl font-bold ${
            data.availableToBudget > 0 ? 'text-green-600' :
            data.availableToBudget < 0 ? 'text-red-600' :
            'text-gray-500'
          }`}>
            {formatCurrency(data.availableToBudget)}
          </div>
        </div>
      )}

      <div className="grid grid-cols-5 gap-4 px-4 py-2 text-xs text-gray-500 uppercase tracking-wide font-medium">
        <div>Category</div>
        <div className="text-right">Default</div>
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
            period={period}
            onSetAllocation={handleSetAllocation}
            defaultsMap={defaultsMap}
            onSetDefault={handleSetDefault}
          />
        ))}
      </div>

      {groups.length === 0 && (
        <p className="text-gray-500 mt-4">No budget categories found. Create categories first.</p>
      )}
    </div>
  );
}
