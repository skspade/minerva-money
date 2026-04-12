import { memo } from 'react';
import CategoryPicker from './CategoryPicker';
import { formatCurrency, parsePayee } from '../lib/format';

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
  dayColor?: { bg: string; border: string };
  isExpanded: boolean;
  onToggle: () => void;
  onCategoryChange: (categoryId: number | null) => void;
  onSplitClick: () => void;
}

export default memo(function TransactionCard({
  txn,
  dayColor,
  isExpanded,
  onToggle,
  onCategoryChange,
  onSplitClick,
}: TransactionCardProps) {
  const { displayName, rawDisplayName, prefix } = parsePayee(txn.payee);

  return (
    <div
      className="bg-surface rounded-lg border border-border shadow-sm"
      style={dayColor ? { borderLeftWidth: '4px', borderLeftColor: dayColor.border } : undefined}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
        className="w-full text-left px-3 py-2 min-h-[44px] cursor-pointer"
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
        {/* Row 2: Account + Category pill */}
        <div className="flex items-center gap-1.5 mt-0.5 text-sm text-text-secondary">
          <span className="truncate">{txn.accountName}</span>
        </div>
      </div>

      {/* Category / Split — inline compact */}
      <div className="px-3 pb-2 -mt-1">
        {txn.splitCount > 0 ? (
          <button
            onClick={onSplitClick}
            className="min-h-[36px] text-accent text-xs font-medium"
          >
            Split ({txn.splitCount})
          </button>
        ) : (
          <CategoryPicker
            value={txn.categoryId}
            onChange={onCategoryChange}
            className="text-xs !rounded-full !px-2 !py-0.5 !border-0 !bg-surface-secondary"
          />
        )}
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="border-t border-border-light px-3 py-2 text-sm text-text-secondary space-y-1">
          {rawDisplayName !== displayName && (
            <div>
              <span className="font-medium text-text-primary">Full name:</span> {rawDisplayName}
            </div>
          )}
          {prefix && (
            <div>
              <span className="font-medium text-text-primary">Original payee:</span> {txn.payee}
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
