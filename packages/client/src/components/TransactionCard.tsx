import CategoryPicker from './CategoryPicker';
import { formatCurrency } from '../lib/format';

interface TransactionCardProps {
  txn: {
    id: string;
    payee: string;
    amount: number;
    date: string;
    accountName: string;
    categoryId: number | null;
    memo: string | null;
    splitCount: number;
    ruleName: string | null;
    isTransfer: boolean;
  };
  isExpanded: boolean;
  onToggle: () => void;
  onCategoryChange: (categoryId: number | null) => void;
  onSplitClick: () => void;
}

export default function TransactionCard({
  txn,
  isExpanded,
  onToggle,
  onCategoryChange,
  onSplitClick,
}: TransactionCardProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      {/* Tappable card body */}
      <button
        onClick={onToggle}
        className="w-full text-left px-3 py-2 min-h-[44px]"
      >
        {/* Row 1: Payee + Transfer badge + Amount */}
        <div className="flex items-center gap-2">
          <span className="font-semibold truncate flex-1">{txn.payee}</span>
          {txn.isTransfer && (
            <span className="shrink-0 px-1.5 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 rounded">
              Transfer
            </span>
          )}
          <span
            className={`shrink-0 font-medium ${txn.amount < 0 ? 'text-red-600' : 'text-gray-900'}`}
          >
            {formatCurrency(txn.amount)}
          </span>
        </div>
        {/* Row 2: Date + Account */}
        <div className="text-sm text-gray-500 mt-0.5">
          {new Date(txn.date + 'T00:00:00').toLocaleDateString()}
          {' \u00b7 '}
          <span className="truncate">{txn.accountName}</span>
        </div>
      </button>

      {/* Category / Split — separate tap zone */}
      <div className="px-3 pb-2">
        {txn.splitCount > 0 ? (
          <button
            onClick={onSplitClick}
            className="min-h-[44px] text-blue-600 text-sm font-medium"
          >
            Split ({txn.splitCount})
          </button>
        ) : (
          <CategoryPicker
            value={txn.categoryId}
            onChange={onCategoryChange}
            className="text-base w-full"
          />
        )}
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="border-t border-gray-100 px-3 py-2 text-sm text-gray-600 space-y-1">
          {txn.memo && (
            <div>
              <span className="font-medium text-gray-700">Memo:</span> {txn.memo}
            </div>
          )}
          {txn.ruleName && (
            <div className="text-xs text-gray-400">Rule: {txn.ruleName}</div>
          )}
          {txn.splitCount === 0 && (
            <button
              onClick={onSplitClick}
              className="min-h-[44px] text-blue-600 text-sm font-medium"
            >
              Split transaction
            </button>
          )}
        </div>
      )}
    </div>
  );
}
