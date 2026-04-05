import { memo } from 'react';
import CategoryPicker from './CategoryPicker';
import { formatCurrency, formatShortDate, parsePayee } from '../lib/format';

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

export default memo(function TransactionCard({
  txn,
  isExpanded,
  onToggle,
  onCategoryChange,
  onSplitClick,
}: TransactionCardProps) {
  const { displayName, prefix } = parsePayee(txn.payee);

  return (
    <div className="bg-surface rounded-lg border border-border shadow-sm">
      {/* Tappable card body */}
      <button
        onClick={onToggle}
        className="w-full text-left px-3 py-2 min-h-[44px]"
      >
        {/* Row 1: Merchant name + Transfer badge + Amount */}
        <div className="flex items-center gap-2">
          <span className="font-semibold truncate flex-1">{displayName}</span>
          {txn.isTransfer && (
            <span className="shrink-0 px-1.5 py-0.5 text-xs font-medium bg-highlight text-highlight-text rounded">
              Transfer
            </span>
          )}
          <span
            className={`shrink-0 font-medium ${txn.amount < 0 ? 'text-danger' : 'text-text-primary'}`}
          >
            {formatCurrency(txn.amount)}
          </span>
        </div>
        {/* Row 2: Prefix + Date + Account */}
        <div className="text-sm text-text-secondary mt-0.5 truncate">
          {prefix && <>{prefix} &middot; </>}
          {formatShortDate(txn.date)}
          {' \u00b7 '}
          {txn.accountName}
        </div>
      </button>

      {/* Category / Split — separate tap zone */}
      <div className="px-3 pb-2">
        {txn.splitCount > 0 ? (
          <button
            onClick={onSplitClick}
            className="min-h-[44px] text-accent text-sm font-medium"
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
        <div className="border-t border-border-light px-3 py-2 text-sm text-text-secondary space-y-1">
          {prefix && (
            <div>
              <span className="font-medium text-text-primary">Full payee:</span> {txn.payee}
            </div>
          )}
          {txn.memo && (
            <div>
              <span className="font-medium text-text-primary">Memo:</span> {txn.memo}
            </div>
          )}
          {txn.ruleName && (
            <div className="text-xs text-text-tertiary">Rule: {txn.ruleName}</div>
          )}
          {txn.splitCount === 0 && (
            <button
              onClick={onSplitClick}
              className="min-h-[44px] text-accent text-sm font-medium"
            >
              Split transaction
            </button>
          )}
        </div>
      )}
    </div>
  );
});
