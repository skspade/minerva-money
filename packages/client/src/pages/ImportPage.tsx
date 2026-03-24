import { useState, useRef, useCallback } from 'react';
import { Link } from 'react-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import { useTRPC } from '../trpc';
import { formatCurrency } from '../lib/format';

type WizardStep = 'upload' | 'preview' | 'results';

// --- Skip Support Helpers ---

export const SKIP_SENTINEL = '__SKIP__';

export function isAccountResolved(value: string): boolean {
  return value !== '' && value.length > 0;
}

export function filterSkippedAccounts(mappings: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(mappings).filter(([, v]) => v !== SKIP_SENTINEL)
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

export default function ImportPage() {
  const trpc = useTRPC();

  const [step, setStep] = useState<WizardStep>('upload');
  const [csvText, setCsvText] = useState('');
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [accountMappings, setAccountMappings] = useState<Record<string, string>>({});
  const [categoryMappings, setCategoryMappings] = useState<Record<string, number>>({});
  const [executeResult, setExecuteResult] = useState<ExecuteResult | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

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

  // File handling
  const handleFile = useCallback((file: File) => {
    setFileError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setCsvText(text);
      previewMutation.mutate({ csvText: text });
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
    executeMutation.mutate({ csvText, accountMappings, categoryMappings });
  };

  const handleReset = () => {
    setStep('upload');
    setCsvText('');
    setPreviewResult(null);
    setAccountMappings({});
    setCategoryMappings({});
    setExecuteResult(null);
    setFileError(null);
    previewMutation.reset();
    executeMutation.reset();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const allAccountsMapped = previewResult
    ? previewResult.accounts.every((a: AccountMatch) => accountMappings[a.csvName] && accountMappings[a.csvName] !== '')
    : false;

  const stepLabel = step === 'upload'
    ? 'Step 1 of 3: Upload'
    : step === 'preview'
      ? 'Step 2 of 3: Review & Map'
      : 'Step 3 of 3: Results';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Import Transactions</h2>
        <p className="text-sm text-gray-500 mt-1">{stepLabel}</p>
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
          accounts={accounts ?? []}
          categoryGroups={categoryGroups ?? []}
          accountMappings={accountMappings}
          categoryMappings={categoryMappings}
          allAccountsMapped={allAccountsMapped}
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
          onContinue={() => setStep('results')}
        />
      )}

      {step === 'results' && previewResult && (
        <ResultsStep
          previewResult={previewResult}
          executeResult={executeResult}
          executeMutation={executeMutation}
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
  dedupStats: { newCount: number; duplicateCount: number };
}

interface ExecuteResult {
  importedCount: number;
  skippedCount: number;
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
      <div className="bg-white rounded-lg shadow p-6 md:p-8 flex flex-col items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-3" />
        <p className="text-gray-500">Parsing file...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={`bg-white rounded-lg shadow p-6 md:p-8 flex flex-col items-center justify-center min-h-[200px] border-2 border-dashed transition-colors cursor-pointer ${
          dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
        }`}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload size={40} className="text-gray-400 mb-3" />
        <p className="text-gray-700 font-medium mb-1">
          Drag and drop your CSV file here
        </p>
        <p className="text-gray-500 text-sm mb-3">or</p>
        <button
          type="button"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            fileInputRef.current?.click();
          }}
        >
          Browse files
        </button>
        <p className="text-gray-400 text-xs mt-3">Supports .csv, .tsv, and .txt files</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.tsv,.txt"
          className="hidden"
          onChange={onInputChange}
        />
      </div>

      {fileError && (
        <p className="text-red-600">{fileError}</p>
      )}
      {previewMutation.isError && (
        <p className="text-red-600">
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
  allAccountsMapped: boolean;
  onAccountMappingChange: (csvName: string, accountId: string) => void;
  onCategoryMappingChange: (csvName: string, categoryId: number) => void;
  onContinue: () => void;
}

function PreviewStep({
  previewResult,
  accounts,
  categoryGroups,
  accountMappings,
  categoryMappings,
  allAccountsMapped,
  onAccountMappingChange,
  onCategoryMappingChange,
  onContinue,
}: PreviewStepProps) {
  return (
    <div className="space-y-6">
      {/* Summary stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{previewResult.totalRows}</p>
          <p className="text-sm text-gray-500">Total rows</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{previewResult.validRows}</p>
          <p className="text-sm text-gray-500">Valid rows</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <p className="text-2xl font-bold text-red-600">{previewResult.errors.length}</p>
          <p className="text-sm text-gray-500">Errors</p>
        </div>
      </div>

      {/* Sample rows */}
      <div className="bg-white rounded-lg shadow p-4 md:p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Sample Rows (first 10)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-2 pr-4">Date</th>
                <th className="pb-2 pr-4">Merchant</th>
                <th className="pb-2 pr-4">Account</th>
                <th className="pb-2 pr-4">Category</th>
                <th className="pb-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {previewResult.sampleRows.map((row, i) => (
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
      </div>

      {/* Dedup stats */}
      <div className="bg-white rounded-lg shadow p-4 md:p-6">
        <p className="text-sm text-gray-700">
          <span className="font-semibold text-green-600">{previewResult.dedupStats.newCount}</span> new transactions to import,{' '}
          <span className="font-semibold text-gray-500">{previewResult.dedupStats.duplicateCount}</span> duplicates to skip
        </p>
      </div>

      {/* Parse errors */}
      {previewResult.errors.length > 0 && (
        <details className="bg-white rounded-lg shadow p-4 md:p-6">
          <summary className="text-sm font-medium text-red-600 cursor-pointer">
            {previewResult.errors.length} parse error{previewResult.errors.length !== 1 ? 's' : ''}
          </summary>
          <ul className="mt-2 space-y-1 text-sm text-red-600">
            {previewResult.errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </details>
      )}

      {/* Account mappings */}
      <div className="bg-white rounded-lg shadow p-4 md:p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Map Accounts</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {previewResult.accounts.map((acct) => (
            <div key={acct.csvName} className="space-y-1">
              <label className="text-sm font-medium text-gray-700">{acct.csvName}</label>
              <select
                value={accountMappings[acct.csvName] ?? ''}
                onChange={(e) => onAccountMappingChange(acct.csvName, e.target.value)}
                className={`w-full rounded-md border px-3 py-2 text-sm ${
                  !accountMappings[acct.csvName] ? 'border-red-300' : 'border-gray-300'
                }`}
              >
                <option value="" disabled>Select account...</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* Category mappings */}
      <div className="bg-white rounded-lg shadow p-4 md:p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Map Categories</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {previewResult.categories.map((cat) => (
            <div key={cat.csvName} className="space-y-1">
              <label className="text-sm font-medium text-gray-700">{cat.csvName}</label>
              <select
                value={categoryMappings[cat.csvName] ?? 0}
                onChange={(e) => onCategoryMappingChange(cat.csvName, Number(e.target.value))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
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
        {!allAccountsMapped && (
          <p className="text-sm text-red-600 self-center">All accounts must be mapped before continuing</p>
        )}
        <button
          onClick={onContinue}
          disabled={!allAccountsMapped}
          className="w-full md:w-auto px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Continue
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
  onImport: () => void;
  onBack: () => void;
  onReset: () => void;
}

function ResultsStep({
  previewResult,
  executeResult,
  executeMutation,
  onImport,
  onBack,
  onReset,
}: ResultsStepProps) {
  // Before execution — show confirm summary
  if (!executeResult) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow p-4 md:p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Import Summary</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <p className="text-2xl font-bold text-green-600">{previewResult.dedupStats.newCount}</p>
              <p className="text-sm text-gray-600">New transactions</p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-gray-500">{previewResult.dedupStats.duplicateCount}</p>
              <p className="text-sm text-gray-600">Duplicates to skip</p>
            </div>
            <div className="text-center p-3 bg-red-50 rounded-lg">
              <p className="text-2xl font-bold text-red-600">{previewResult.errors.length}</p>
              <p className="text-sm text-gray-600">Error rows</p>
            </div>
          </div>
        </div>

        {executeMutation.isError && (
          <p className="text-red-600">
            Import failed: {executeMutation.error?.message ?? 'Unknown error'}
          </p>
        )}

        <div className="flex flex-col md:flex-row md:justify-between gap-3">
          <button
            onClick={onBack}
            className="w-full md:w-auto px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Back to Mapping
          </button>
          <button
            onClick={onImport}
            disabled={executeMutation.isPending}
            className="w-full md:w-auto px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
      <div className="bg-white rounded-lg shadow p-4 md:p-6">
        <h3 className="text-lg font-semibold text-green-700 mb-4">Import Complete</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-3 bg-green-50 rounded-lg">
            <p className="text-2xl font-bold text-green-600">{executeResult.importedCount}</p>
            <p className="text-sm text-gray-600">Transactions imported</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-gray-500">{executeResult.skippedCount}</p>
            <p className="text-sm text-gray-600">Duplicates skipped</p>
          </div>
          <div className="p-3 bg-blue-50 rounded-lg">
            <p className="text-2xl font-bold text-blue-600">{executeResult.categorizedByRules}</p>
            <p className="text-sm text-gray-600">Categorized by rules</p>
          </div>
          <div className="p-3 bg-purple-50 rounded-lg">
            <p className="text-2xl font-bold text-purple-600">{executeResult.categorizedFromCsv}</p>
            <p className="text-sm text-gray-600">Categorized from CSV</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:justify-center gap-3">
        <Link
          to="/transactions"
          className="w-full md:w-auto px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-center"
        >
          View Transactions
        </Link>
        <button
          onClick={onReset}
          className="w-full md:w-auto px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Import Another
        </button>
      </div>
    </div>
  );
}
