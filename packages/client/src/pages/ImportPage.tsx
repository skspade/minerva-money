import { useState, useRef, useCallback } from 'react';
import { Link } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import { useTRPC } from '../trpc';
import { formatCurrency } from '../lib/format';

type WizardStep = 'upload' | 'preview' | 'results';

// --- Skip Support Helpers ---

export const SKIP_SENTINEL = '__SKIP__';
export const CREATE_NEW_SENTINEL = '__CREATE_NEW__';

export function isAccountResolved(value: string): boolean {
  return value !== '' && value !== CREATE_NEW_SENTINEL && value.length > 0;
}

export function filterSkippedAccounts(mappings: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(mappings).filter(([, v]) => v !== SKIP_SENTINEL && v !== CREATE_NEW_SENTINEL)
  );
}

export function getValidationState(
  accounts: { csvName: string }[],
  mappings: Record<string, string>
): { canContinue: boolean; message: string | null } {
  if (accounts.length === 0) {
    return { canContinue: false, message: null };
  }
  const hasUndecided = accounts.some(a => !isAccountResolved(mappings[a.csvName] ?? ''));
  if (hasUndecided) {
    return { canContinue: false, message: 'All accounts must be mapped or skipped before continuing' };
  }
  const allSkipped = accounts.every(a => mappings[a.csvName] === SKIP_SENTINEL);
  if (allSkipped) {
    return { canContinue: false, message: 'At least one account must be mapped to import' };
  }
  return { canContinue: true, message: null };
}

export function computeSkipFilterStats(
  accountMappings: Record<string, string>,
  rowCountByAccount: Record<string, number>
): { skippedAccountNames: Set<string>; skippedRowCount: number } {
  const skippedAccountNames = new Set(
    Object.entries(accountMappings)
      .filter(([, v]) => v === SKIP_SENTINEL)
      .map(([k]) => k)
  );
  const skippedRowCount = [...skippedAccountNames]
    .reduce((sum, name) => sum + (rowCountByAccount[name] ?? 0), 0);
  return { skippedAccountNames, skippedRowCount };
}

export default function ImportPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<WizardStep>('upload');
  const [csvText, setCsvText] = useState('');
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [accountMappings, setAccountMappings] = useState<Record<string, string>>({});
  const [categoryMappings, setCategoryMappings] = useState<Record<string, number>>({});
  const [executeResult, setExecuteResult] = useState<ExecuteResult | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [negateAmounts, setNegateAmounts] = useState(false);
  const [creatingAccountFor, setCreatingAccountFor] = useState<string | null>(null);
  const [localAccounts, setLocalAccounts] = useState<{ id: string; name: string }[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Queries for mapping dropdowns
  const { data: accounts } = useQuery(trpc.accounts.list.queryOptions());
  const { data: categoryGroups } = useQuery(trpc.categories.groups.list.queryOptions());

  // Mutations
  const previewMutation = useMutation(trpc.import.preview.mutationOptions({
    onSuccess: (data) => {
      setPreviewResult(data);
      const acctMap: Record<string, string> = {};
      data.accounts.forEach((a: AccountMatch) => {
        acctMap[a.csvName] = a.suggestedId ?? '';
      });
      setAccountMappings(acctMap);
      const catMap: Record<string, number> = {};
      data.categories.forEach((c: CategoryMatch) => {
        if (c.suggestedId) catMap[c.csvName] = c.suggestedId;
      });
      setCategoryMappings(catMap);
      setStep('preview');
    },
  }));

  const executeMutation = useMutation(trpc.import.execute.mutationOptions({
    onSuccess: (data) => {
      setExecuteResult(data);
    },
  }));

  const createAccountMutation = useMutation(trpc.accounts.create.mutationOptions({
    onSuccess: (newAccount) => {
      setLocalAccounts(prev => [...prev, { id: newAccount.id, name: newAccount.name }]);
      if (creatingAccountFor) {
        setAccountMappings(prev => ({ ...prev, [creatingAccountFor]: newAccount.id }));
        setCreatingAccountFor(null);
      }
      queryClient.invalidateQueries({ queryKey: trpc.accounts.list.queryKey() });
    },
  }));

  // File handling
  const handleFile = useCallback((file: File) => {
    setFileError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setCsvText(text);
      previewMutation.mutate({ csvText: text, negateAmounts });
    };
    reader.onerror = () => {
      setFileError('Failed to read file. Please ensure it is a valid text file.');
    };
    reader.readAsText(file);
  }, [previewMutation]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragActive(false);
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleImport = () => {
    const filteredMappings = filterSkippedAccounts(accountMappings);
    executeMutation.mutate({ csvText, accountMappings: filteredMappings, categoryMappings, negateAmounts });
  };

  const handleReset = () => {
    setStep('upload');
    setCsvText('');
    setPreviewResult(null);
    setAccountMappings({});
    setCategoryMappings({});
    setExecuteResult(null);
    setFileError(null);
    setNegateAmounts(false);
    setCreatingAccountFor(null);
    setLocalAccounts([]);
    previewMutation.reset();
    executeMutation.reset();
    createAccountMutation.reset();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const validationState = previewResult
    ? getValidationState(previewResult.accounts, accountMappings)
    : { canContinue: false, message: null };

  const stepLabel = step === 'upload'
    ? 'Step 1 of 3: Upload'
    : step === 'preview'
      ? 'Step 2 of 3: Review & Map'
      : 'Step 3 of 3: Results';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-text-primary">Import Transactions</h2>
        <p className="text-sm text-text-secondary mt-1">{stepLabel}</p>
      </div>

      {step === 'upload' && (
        <UploadStep
          dragActive={dragActive}
          fileError={fileError}
          previewMutation={previewMutation}
          fileInputRef={fileInputRef}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onInputChange={handleInputChange}
        />
      )}

      {step === 'preview' && previewResult && (
        <PreviewStep
          previewResult={previewResult}
          accounts={[...(accounts ?? []), ...localAccounts]}
          categoryGroups={categoryGroups ?? []}
          accountMappings={accountMappings}
          categoryMappings={categoryMappings}
          negateAmounts={negateAmounts}
          onNegateAmountsChange={(value) => {
            setNegateAmounts(value);
            previewMutation.mutate({ csvText, negateAmounts: value });
          }}
          validationState={validationState}
          onAccountMappingChange={(csvName, accountId) => {
            setAccountMappings(prev => ({ ...prev, [csvName]: accountId }));
          }}
          onCategoryMappingChange={(csvName, categoryId) => {
            setCategoryMappings(prev => {
              const next = { ...prev };
              if (categoryId === 0) {
                delete next[csvName];
              } else {
                next[csvName] = categoryId;
              }
              return next;
            });
          }}
          onContinue={() => {
            const filteredMappings = filterSkippedAccounts(accountMappings);
            previewMutation.mutate(
              { csvText, negateAmounts, accountMappings: filteredMappings },
              { onSuccess: (data) => { setPreviewResult(data); setStep('results'); } },
            );
          }}
          onSkipAllUnmatched={() => {
            setAccountMappings(prev => {
              const next = { ...prev };
              previewResult!.accounts.forEach(a => {
                if (!next[a.csvName] || next[a.csvName] === '') {
                  next[a.csvName] = SKIP_SENTINEL;
                }
              });
              return next;
            });
          }}
          creatingAccountFor={creatingAccountFor}
          onCreateAccount={(csvName) => {
            setCreatingAccountFor(csvName);
            setAccountMappings(prev => ({ ...prev, [csvName]: CREATE_NEW_SENTINEL }));
          }}
          onCancelCreate={() => {
            if (creatingAccountFor) {
              setAccountMappings(prev => ({ ...prev, [creatingAccountFor]: '' }));
            }
            setCreatingAccountFor(null);
            createAccountMutation.reset();
          }}
          onSubmitCreate={(input) => createAccountMutation.mutate(input)}
          createAccountPending={createAccountMutation.isPending}
          createAccountError={createAccountMutation.error?.message ?? null}
        />
      )}

      {step === 'results' && previewResult && (
        <ResultsStep
          previewResult={previewResult}
          executeResult={executeResult}
          executeMutation={executeMutation}
          accountMappings={accountMappings}
          onImport={handleImport}
          onBack={() => { executeMutation.reset(); setExecuteResult(null); setStep('preview'); }}
          onReset={handleReset}
        />
      )}
    </div>
  );
}

// --- Types (inferred from server) ---

interface TransformedRow {
  date: string;
  amount: number;
  payee: string;
  memo: string | null;
  merchantName: string;
  categoryName: string;
  accountName: string;
}

interface AccountMatch {
  csvName: string;
  suggestedId: string | null;
  suggestedName: string | null;
}

interface CategoryMatch {
  csvName: string;
  suggestedId: number | null;
  suggestedName: string | null;
}

interface PreviewResult {
  totalRows: number;
  validRows: number;
  sampleRows: TransformedRow[];
  errors: string[];
  accounts: AccountMatch[];
  categories: CategoryMatch[];
  rowCountByAccount: Record<string, number>;
  dedupStats: { newCount: number; duplicateCount: number };
}

interface ExecuteResult {
  importedCount: number;
  skippedCount: number;
  skippedByAccountFilter: number;
  categorizedByRules: number;
  categorizedFromCsv: number;
}

// --- Upload Step ---

interface UploadStepProps {
  dragActive: boolean;
  fileError: string | null;
  previewMutation: { isPending: boolean; isError: boolean; error: { message: string } | null };
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function UploadStep({
  dragActive,
  fileError,
  previewMutation,
  fileInputRef,
  onDrop,
  onDragOver,
  onDragLeave,
  onInputChange,
}: UploadStepProps) {
  if (previewMutation.isPending) {
    return (
      <div className="bg-surface rounded-lg shadow p-6 md:p-8 flex flex-col items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent mb-3" />
        <p className="text-text-secondary">Parsing file...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={`bg-surface rounded-lg shadow p-6 md:p-8 flex flex-col items-center justify-center min-h-[200px] border-2 border-dashed transition-colors cursor-pointer ${
          dragActive ? 'border-accent bg-accent-light' : 'border-border-heavy'
        }`}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload size={40} className="text-text-tertiary mb-3" />
        <p className="text-text-primary font-medium mb-1">
          Drag and drop your CSV file here
        </p>
        <p className="text-text-secondary text-sm mb-3">or</p>
        <button
          type="button"
          className="px-4 py-2 bg-accent text-text-invert rounded-lg hover:bg-accent-hover transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            fileInputRef.current?.click();
          }}
        >
          Browse files
        </button>
        <p className="text-text-tertiary text-xs mt-3">Supports .csv, .tsv, and .txt files</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.tsv,.txt"
          className="hidden"
          onChange={onInputChange}
        />
      </div>

      {fileError && (
        <p className="text-danger">{fileError}</p>
      )}
      {previewMutation.isError && (
        <p className="text-danger">
          Error parsing file: {previewMutation.error?.message ?? 'Unknown error'}
        </p>
      )}
    </div>
  );
}

// --- Preview Step ---

interface PreviewStepProps {
  previewResult: PreviewResult;
  accounts: { id: string; name: string }[];
  categoryGroups: { id: number; name: string; categories: { id: number; name: string }[] }[];
  accountMappings: Record<string, string>;
  categoryMappings: Record<string, number>;
  negateAmounts: boolean;
  onNegateAmountsChange: (value: boolean) => void;
  validationState: { canContinue: boolean; message: string | null };
  onAccountMappingChange: (csvName: string, accountId: string) => void;
  onCategoryMappingChange: (csvName: string, categoryId: number) => void;
  onContinue: () => void;
  onSkipAllUnmatched: () => void;
  creatingAccountFor: string | null;
  onCreateAccount: (csvName: string) => void;
  onCancelCreate: () => void;
  onSubmitCreate: (input: { name: string; institution: string; type: 'banking' | 'credit' }) => void;
  createAccountPending: boolean;
  createAccountError: string | null;
}

function PreviewStep({
  previewResult,
  accounts,
  categoryGroups,
  accountMappings,
  categoryMappings,
  negateAmounts,
  onNegateAmountsChange,
  validationState,
  onAccountMappingChange,
  onCategoryMappingChange,
  onContinue,
  onSkipAllUnmatched,
  creatingAccountFor,
  onCreateAccount,
  onCancelCreate,
  onSubmitCreate,
  createAccountPending,
  createAccountError,
}: PreviewStepProps) {
  const { skippedAccountNames, skippedRowCount } = computeSkipFilterStats(accountMappings, previewResult.rowCountByAccount);
  const filteredTotalRows = previewResult.totalRows - skippedRowCount;
  const filteredValidRows = previewResult.validRows - skippedRowCount;
  const filteredSampleRows = previewResult.sampleRows.filter(row => !skippedAccountNames.has(row.accountName));
  const skippedAccountCount = skippedAccountNames.size;
  const mappedAccountCount = Object.values(accountMappings).filter(v => v !== '' && v !== SKIP_SENTINEL && v !== CREATE_NEW_SENTINEL).length;
  const hasSkippedAccounts = skippedAccountCount > 0;

  return (
    <div className="space-y-6">
      {/* Summary banner */}
      {hasSkippedAccounts && (
        <div className="bg-warning-light border border-warning rounded-lg p-3 text-sm text-warning">
          Importing from {mappedAccountCount} of {previewResult.accounts.length} accounts ({skippedAccountCount} skipped)
        </div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface rounded-lg shadow p-4 text-center">
          <p className="text-2xl font-bold text-text-primary">{hasSkippedAccounts ? filteredTotalRows : previewResult.totalRows}</p>
          <p className="text-sm text-text-secondary">Total rows</p>
        </div>
        <div className="bg-surface rounded-lg shadow p-4 text-center">
          <p className="text-2xl font-bold text-success">{hasSkippedAccounts ? filteredValidRows : previewResult.validRows}</p>
          <p className="text-sm text-text-secondary">Valid rows</p>
        </div>
        <div className="bg-surface rounded-lg shadow p-4 text-center">
          <p className="text-2xl font-bold text-danger">{previewResult.errors.length}</p>
          <p className="text-sm text-text-secondary">Errors</p>
        </div>
      </div>

      {/* Negate amounts toggle */}
      <div className="bg-surface rounded-lg shadow p-4 md:p-6">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={negateAmounts}
            onChange={(e) => onNegateAmountsChange(e.target.checked)}
            className="h-4 w-4 rounded border-border-heavy text-accent focus:ring-accent"
          />
          <div>
            <span className="text-sm font-medium text-text-primary">Negate amounts (swap credits/debits)</span>
            <p className="text-xs text-text-secondary">
              Enable this if your bank exports debits as positive and credits as negative
            </p>
          </div>
        </label>
      </div>

      {/* Sample rows */}
      <div className="bg-surface rounded-lg shadow p-4 md:p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-3">Sample Rows (first 10)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-text-secondary">
                <th className="pb-2 pr-4">Date</th>
                <th className="pb-2 pr-4">Merchant</th>
                <th className="pb-2 pr-4">Account</th>
                <th className="pb-2 pr-4">Category</th>
                <th className="pb-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {filteredSampleRows.map((row, i) => (
                <tr key={i} className="border-b last:border-b-0">
                  <td className="py-2 pr-4 whitespace-nowrap">{row.date}</td>
                  <td className="py-2 pr-4 truncate max-w-[200px]">{row.merchantName}</td>
                  <td className="py-2 pr-4 truncate max-w-[150px]">{row.accountName}</td>
                  <td className="py-2 pr-4 truncate max-w-[150px]">{row.categoryName || '—'}</td>
                  <td className="py-2 text-right whitespace-nowrap">{formatCurrency(row.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {hasSkippedAccounts && filteredSampleRows.length < previewResult.sampleRows.length && (
          <p className="text-xs text-text-secondary mt-2">
            Showing {filteredSampleRows.length} of {previewResult.sampleRows.length} sample rows ({previewResult.sampleRows.length - filteredSampleRows.length} excluded from skipped accounts)
          </p>
        )}
      </div>

      {/* Dedup stats */}
      <div className="bg-surface rounded-lg shadow p-4 md:p-6">
        <p className="text-sm text-text-primary">
          <span className="font-semibold text-success">{previewResult.dedupStats.newCount}</span> new transactions to import,{' '}
          <span className="font-semibold text-text-secondary">{previewResult.dedupStats.duplicateCount}</span> duplicates to skip
        </p>
        {hasSkippedAccounts && (
          <p className="text-xs text-text-secondary mt-1">
            Excludes {skippedRowCount} rows from {skippedAccountCount} skipped account{skippedAccountCount !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Parse errors */}
      {previewResult.errors.length > 0 && (
        <details className="bg-surface rounded-lg shadow p-4 md:p-6">
          <summary className="text-sm font-medium text-danger cursor-pointer">
            {previewResult.errors.length} parse error{previewResult.errors.length !== 1 ? 's' : ''}
          </summary>
          <ul className="mt-2 space-y-1 text-sm text-danger">
            {previewResult.errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </details>
      )}

      {/* Account mappings */}
      <div className="bg-surface rounded-lg shadow p-4 md:p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-text-primary">Map Accounts</h3>
          {previewResult.accounts.some(a => !accountMappings[a.csvName] || accountMappings[a.csvName] === '') && (
            <button
              type="button"
              onClick={onSkipAllUnmatched}
              className="text-sm text-warning hover:text-warning transition-colors"
            >
              Skip All Unmatched
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {previewResult.accounts.map((acct) => (
            <div key={acct.csvName} className={`space-y-1 ${
              accountMappings[acct.csvName] === SKIP_SENTINEL
                ? 'opacity-60 border-l-4 border-warning pl-3'
                : ''
            }`}>
              <label className="text-sm font-medium text-text-primary">
                {acct.csvName}
                {previewResult.rowCountByAccount[acct.csvName] != null && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-surface-secondary text-text-secondary">
                    {previewResult.rowCountByAccount[acct.csvName]} {previewResult.rowCountByAccount[acct.csvName] === 1 ? 'row' : 'rows'}
                  </span>
                )}
              </label>
              <select
                value={accountMappings[acct.csvName] ?? ''}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === CREATE_NEW_SENTINEL) {
                    onCreateAccount(acct.csvName);
                  } else {
                    onAccountMappingChange(acct.csvName, val);
                  }
                }}
                className={`w-full rounded-md border px-3 py-2 text-sm ${
                  !accountMappings[acct.csvName] ? 'border-danger' :
                  accountMappings[acct.csvName] === SKIP_SENTINEL ? 'border-warning' :
                  accountMappings[acct.csvName] === CREATE_NEW_SENTINEL ? 'border-accent' :
                  'border-border-heavy'
                }`}
              >
                <option value="" disabled>Select account...</option>
                <option value={SKIP_SENTINEL}>Skip — do not import</option>
                <option value={CREATE_NEW_SENTINEL}>+ Create New Account</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              {accountMappings[acct.csvName] === SKIP_SENTINEL && (
                <p className="text-xs text-warning italic">Skipped — rows from this account will not be imported</p>
              )}
              {creatingAccountFor === acct.csvName && (
                <InlineAccountForm
                  defaultName={acct.csvName}
                  onSubmit={onSubmitCreate}
                  onCancel={onCancelCreate}
                  isPending={createAccountPending}
                  error={createAccountError}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Category mappings */}
      <div className="bg-surface rounded-lg shadow p-4 md:p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-3">Map Categories</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {previewResult.categories.map((cat) => (
            <div key={cat.csvName} className="space-y-1">
              <label className="text-sm font-medium text-text-primary">{cat.csvName}</label>
              <select
                value={categoryMappings[cat.csvName] ?? 0}
                onChange={(e) => onCategoryMappingChange(cat.csvName, Number(e.target.value))}
                className="w-full rounded-md border border-border-heavy px-3 py-2 text-sm"
              >
                <option value={0}>Uncategorized</option>
                {categoryGroups.map((group) => (
                  <optgroup key={group.id} label={group.name}>
                    {group.categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* Continue button */}
      <div className="flex flex-col md:flex-row md:justify-end gap-3">
        {validationState.message && (
          <p className="text-sm text-danger self-center">{validationState.message}</p>
        )}
        <button
          onClick={onContinue}
          disabled={!validationState.canContinue}
          className="w-full md:w-auto px-6 py-2 bg-accent text-text-invert rounded-lg hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

// --- Inline Account Form ---

function InlineAccountForm({
  defaultName,
  onSubmit,
  onCancel,
  isPending,
  error,
}: {
  defaultName: string;
  onSubmit: (input: { name: string; institution: string; type: 'banking' | 'credit' }) => void;
  onCancel: () => void;
  isPending: boolean;
  error: string | null;
}) {
  const [name, setName] = useState(defaultName);
  const [institution, setInstitution] = useState('');
  const [type, setType] = useState<'banking' | 'credit'>('banking');

  const canSubmit = name.trim() !== '' && institution.trim() !== '' && !isPending;

  return (
    <div className="mt-2 p-3 bg-accent-light border border-accent rounded-lg space-y-2">
      <p className="text-xs font-medium text-accent">New Account</p>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Account name"
        className="w-full rounded-md border border-border-heavy px-3 py-1.5 text-sm"
      />
      <input
        type="text"
        value={institution}
        onChange={(e) => setInstitution(e.target.value)}
        placeholder="Institution (required)"
        className="w-full rounded-md border border-border-heavy px-3 py-1.5 text-sm"
      />
      <select
        value={type}
        onChange={(e) => setType(e.target.value as 'banking' | 'credit')}
        className="w-full rounded-md border border-border-heavy px-3 py-1.5 text-sm"
      >
        <option value="banking">Banking</option>
        <option value="credit">Credit</option>
      </select>
      {error && (
        <p className="text-xs text-danger">{error}</p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onSubmit({ name: name.trim(), institution: institution.trim(), type })}
          disabled={!canSubmit}
          className="px-3 py-1 text-sm bg-accent text-text-invert rounded hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? 'Creating...' : 'Create'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="px-3 py-1 text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// --- Results Step ---

interface ResultsStepProps {
  previewResult: PreviewResult;
  executeResult: ExecuteResult | null;
  executeMutation: { isPending: boolean; isError: boolean; error: { message: string } | null };
  accountMappings: Record<string, string>;
  onImport: () => void;
  onBack: () => void;
  onReset: () => void;
}

function ResultsStep({
  previewResult,
  executeResult,
  executeMutation,
  accountMappings,
  onImport,
  onBack,
  onReset,
}: ResultsStepProps) {
  // Before execution — show confirm summary
  if (!executeResult) {
    const { skippedAccountNames, skippedRowCount } = computeSkipFilterStats(accountMappings, previewResult.rowCountByAccount);
    const skippedAccountCount = skippedAccountNames.size;
    const hasSkippedAccounts = skippedAccountCount > 0;

    return (
      <div className="space-y-6">
        <div className="bg-surface rounded-lg shadow p-4 md:p-6">
          <h3 className="text-lg font-semibold text-text-primary mb-4">Import Summary</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-3 bg-success-light rounded-lg">
              <p className="text-2xl font-bold text-success">{previewResult.dedupStats.newCount}</p>
              <p className="text-sm text-text-secondary">New transactions</p>
            </div>
            <div className="text-center p-3 bg-surface-alt rounded-lg">
              <p className="text-2xl font-bold text-text-secondary">{previewResult.dedupStats.duplicateCount}</p>
              <p className="text-sm text-text-secondary">Duplicates to skip</p>
            </div>
            <div className="text-center p-3 bg-danger-light rounded-lg">
              <p className="text-2xl font-bold text-danger">{previewResult.errors.length}</p>
              <p className="text-sm text-text-secondary">Error rows</p>
            </div>
            {hasSkippedAccounts && (
              <div className="text-center p-3 bg-warning-light rounded-lg">
                <p className="text-2xl font-bold text-warning">{skippedRowCount}</p>
                <p className="text-sm text-text-secondary">Skipped (account filter)</p>
              </div>
            )}
          </div>
          {hasSkippedAccounts && (
            <p className="text-xs text-text-secondary mt-3">
              Excludes {skippedRowCount} rows from {skippedAccountCount} skipped account{skippedAccountCount !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        {executeMutation.isError && (
          <p className="text-danger">
            Import failed: {executeMutation.error?.message ?? 'Unknown error'}
          </p>
        )}

        <div className="flex flex-col md:flex-row md:justify-between gap-3">
          <button
            onClick={onBack}
            className="w-full md:w-auto px-6 py-2 border border-border-heavy text-text-primary rounded-lg hover:bg-surface-alt transition-colors"
          >
            Back to Mapping
          </button>
          <button
            onClick={onImport}
            disabled={executeMutation.isPending}
            className="w-full md:w-auto px-6 py-2 bg-accent text-text-invert rounded-lg hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {executeMutation.isPending ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Importing...
              </span>
            ) : (
              'Import'
            )}
          </button>
        </div>
      </div>
    );
  }

  // After execution — show results
  return (
    <div className="space-y-6">
      <div className="bg-surface rounded-lg shadow p-4 md:p-6">
        <h3 className="text-lg font-semibold text-success mb-4">Import Complete</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-3 bg-success-light rounded-lg">
            <p className="text-2xl font-bold text-success">{executeResult.importedCount}</p>
            <p className="text-sm text-text-secondary">Transactions imported</p>
          </div>
          <div className="p-3 bg-surface-alt rounded-lg">
            <p className="text-2xl font-bold text-text-secondary">{executeResult.skippedCount}</p>
            <p className="text-sm text-text-secondary">Duplicates skipped</p>
          </div>
          <div className="p-3 bg-accent-light rounded-lg">
            <p className="text-2xl font-bold text-accent">{executeResult.categorizedByRules}</p>
            <p className="text-sm text-text-secondary">Categorized by rules</p>
          </div>
          <div className="p-3 bg-highlight rounded-lg">
            <p className="text-2xl font-bold text-highlight-text">{executeResult.categorizedFromCsv}</p>
            <p className="text-sm text-text-secondary">Categorized from CSV</p>
          </div>
          {executeResult.skippedByAccountFilter > 0 && (
            <div className="p-3 bg-warning-light rounded-lg">
              <p className="text-2xl font-bold text-warning">{executeResult.skippedByAccountFilter}</p>
              <p className="text-sm text-text-secondary">Skipped (account filter)</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:justify-center gap-3">
        <Link
          to="/transactions"
          className="w-full md:w-auto px-6 py-2 bg-accent text-text-invert rounded-lg hover:bg-accent-hover transition-colors text-center"
        >
          View Transactions
        </Link>
        <button
          onClick={onReset}
          className="w-full md:w-auto px-6 py-2 border border-border-heavy text-text-primary rounded-lg hover:bg-surface-alt transition-colors"
        >
          Import Another
        </button>
      </div>
    </div>
  );
}
