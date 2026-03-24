import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Drawer } from 'vaul';
import { useTRPC } from '../trpc';
import { formatCurrency } from '../lib/format';
import RuleForm from '../components/RuleForm';
import RetroactivePreview from '../components/RetroactivePreview';
import InlineConfirm from '../components/InlineConfirm';

function formatConditions(rule: { merchantPattern: string | null; matchType: string; amountMin: number | null; amountMax: number | null; memoPattern: string | null }): string {
  const parts: string[] = [];
  if (rule.merchantPattern) {
    parts.push(`Merchant ${rule.matchType === 'exact' ? '=' : 'contains'} "${rule.merchantPattern}"`);
  }
  if (rule.amountMin !== null && rule.amountMax !== null) {
    parts.push(`Amount ${formatCurrency(rule.amountMin)} - ${formatCurrency(rule.amountMax)}`);
  } else if (rule.amountMin !== null) {
    parts.push(`Amount >= ${formatCurrency(rule.amountMin)}`);
  } else if (rule.amountMax !== null) {
    parts.push(`Amount <= ${formatCurrency(rule.amountMax)}`);
  }
  if (rule.memoPattern) {
    parts.push(`Memo contains "${rule.memoPattern}"`);
  }
  return parts.join(', ');
}

export default function RulesPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: rules, isLoading, error } = useQuery(trpc.rules.list.queryOptions());

  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<typeof rules extends (infer T)[] | undefined ? T | null : never>(null);
  const [previewRuleId, setPreviewRuleId] = useState<number | null>(null);

  const deleteMut = useMutation(trpc.rules.delete.mutationOptions({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.rules.list.queryKey() });
    },
  }));

  if (isLoading) {
    return <p className="text-gray-500">Loading rules...</p>;
  }

  if (error) {
    return <p className="text-red-600">Error loading rules: {error.message}</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">Rules</h2>
        {!showForm && !editingRule && (
          <button
            onClick={() => setShowForm(true)}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
          >
            Create Rule
          </button>
        )}
      </div>

      <div className="hidden md:block">
        {(showForm || editingRule) && (
          <RuleForm
            initialRule={editingRule ?? undefined}
            onSaved={(ruleId) => {
              setShowForm(false);
              setEditingRule(null);
              if (!editingRule) {
                setPreviewRuleId(ruleId);
              }
              queryClient.invalidateQueries({ queryKey: trpc.rules.list.queryKey() });
            }}
            onCancel={() => {
              setShowForm(false);
              setEditingRule(null);
            }}
          />
        )}
      </div>

      <Drawer.Root open={showForm || !!editingRule} onOpenChange={(o) => { if (!o) { setShowForm(false); setEditingRule(null); } }}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50 md:hidden" />
          <Drawer.Content className="fixed bottom-0 inset-x-0 z-50 bg-white rounded-t-2xl max-h-[90svh] flex flex-col pb-safe md:hidden">
            <div className="mx-auto w-12 h-1.5 bg-gray-300 rounded-full mt-3 mb-2 flex-shrink-0" />
            <div className="overflow-y-auto flex-1">
              <RuleForm
                initialRule={editingRule ?? undefined}
                onSaved={(ruleId) => {
                  setShowForm(false);
                  setEditingRule(null);
                  if (!editingRule) {
                    setPreviewRuleId(ruleId);
                  }
                  queryClient.invalidateQueries({ queryKey: trpc.rules.list.queryKey() });
                }}
                onCancel={() => {
                  setShowForm(false);
                  setEditingRule(null);
                }}
              />
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      {previewRuleId !== null && (
        <RetroactivePreview
          ruleId={previewRuleId}
          onClose={() => setPreviewRuleId(null)}
        />
      )}

      {!rules || rules.length === 0 ? (
        <p className="text-gray-500">No rules created yet. Create your first rule to auto-categorize transactions.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-100 text-left text-sm font-semibold text-gray-700">
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Conditions</th>
                <th className="px-4 py-2">Category</th>
                <th className="px-4 py-2 text-center">Score</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map(rule => (
                <tr key={rule.id} className="border-b border-gray-200 even:bg-gray-50 hover:bg-gray-100">
                  <td className="px-4 py-2 text-sm font-medium">{rule.name}</td>
                  <td className="px-4 py-2 text-sm text-gray-600">{formatConditions(rule)}</td>
                  <td className="px-4 py-2 text-sm">{rule.categoryName}</td>
                  <td className="px-4 py-2 text-sm text-center">{rule.specificityScore}</td>
                  <td className="px-4 py-2 text-sm">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingRule(rule)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        Edit
                      </button>
                      <InlineConfirm message={`Delete rule "${rule.name}"?`} onConfirm={() => deleteMut.mutate({ id: rule.id })}>
                        <button className="text-red-600 hover:text-red-800">Delete</button>
                      </InlineConfirm>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
