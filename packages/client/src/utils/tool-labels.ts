const TOOL_LABELS: Record<string, string> = {
  // Query tools
  get_account_balances: 'Checking account balances...',
  get_budget_summary: 'Reviewing your budget...',
  get_spending_by_category: 'Analyzing spending by category...',
  get_spending_over_time: 'Analyzing spending trends...',
  get_net_worth: 'Calculating net worth...',
  get_available_to_budget: 'Checking available funds...',
  list_transactions: 'Looking up transactions...',
  get_uncategorized_transactions: 'Finding uncategorized transactions...',
  list_categories: 'Loading categories...',
  list_rules: 'Loading rules...',
  get_sync_status: 'Checking sync status...',
  get_transfer_suggestions: 'Finding transfer matches...',
  // Action tools
  categorize_transaction: 'Categorizing transaction...',
  create_rule: 'Creating rule...',
  update_rule: 'Updating rule...',
  delete_rule: 'Deleting rule...',
  apply_rule: 'Applying rule...',
  set_budget_allocation: 'Setting budget allocation...',
  set_default_allocation: 'Setting default allocation...',
  confirm_transfer: 'Confirming transfer...',
  dismiss_transfer: 'Dismissing transfer...',
  trigger_sync: 'Syncing accounts...',
  create_category_group: 'Creating category group...',
  create_category: 'Creating category...',
  // Built-in SDK tools
  WebSearch: 'Searching the web...',
};

export function getToolLabel(toolName: string): string {
  if (!toolName) return 'Working...';
  return TOOL_LABELS[toolName] ?? `Working on ${toolName.replace(/_/g, ' ')}...`;
}
