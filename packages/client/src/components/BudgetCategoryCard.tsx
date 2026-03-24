import { AllocationCell } from './AllocationCell';
import { formatCurrency } from '../lib/format';

interface BudgetCategoryCardProps {
  cat: {
    categoryId: number;
    categoryName: string;
    allocated: number;
    spent: number;
    available: number;
  };
  isExpanded: boolean;
  onToggle: () => void;
  onSave: (cents: number) => void;
}

function progressColor(available: number, allocated: number): string {
  if (available < 0) return 'bg-red-500';
  if (available < allocated * 0.2) return 'bg-yellow-400';
  return 'bg-green-500';
}

function remainingColor(available: number): string {
  if (available < 0) return 'text-red-600';
  if (available > 0) return 'text-green-600';
  return 'text-gray-500';
}

export default function BudgetCategoryCard({
  cat,
  isExpanded,
  onToggle,
  onSave,
}: BudgetCategoryCardProps) {
  const progressWidth =
    cat.allocated === 0
      ? cat.spent > 0
        ? 100
        : 0
      : Math.min((cat.spent / cat.allocated) * 100, 100);

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      <button
        onClick={onToggle}
        className="w-full text-left px-3 py-3 min-h-[44px]"
      >
        {/* Row 1: Category name + remaining */}
        <div className="flex items-center justify-between">
          <span className="font-medium text-sm">{cat.categoryName}</span>
          <span className={`text-sm font-medium ${remainingColor(cat.available)}`}>
            {formatCurrency(cat.available)}
          </span>
        </div>

        {/* Progress bar */}
        <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${progressColor(cat.available, cat.allocated)}`}
            style={{ width: `${progressWidth}%` }}
          />
        </div>

        {/* Row 2: Spent of budgeted */}
        <div className="mt-1 text-xs text-gray-500">
          {formatCurrency(cat.spent)} of {formatCurrency(cat.allocated)}
        </div>
      </button>

      {/* Expanded: allocation editor */}
      {isExpanded && (
        <div className="border-t border-gray-100 px-3 py-2 flex items-center justify-between">
          <span className="text-sm text-gray-600">Allocation</span>
          <AllocationCell value={cat.allocated} onSave={onSave} />
        </div>
      )}
    </div>
  );
}
