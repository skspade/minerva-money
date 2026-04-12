import { describe, it, expect } from 'vitest';
import { getToolLabel } from './tool-labels';

const KNOWN_TOOLS = [
  'get_account_balances',
  'get_budget_summary',
  'get_spending_by_category',
  'get_spending_over_time',
  'get_net_worth',
  'get_available_to_budget',
  'list_transactions',
  'get_uncategorized_transactions',
  'list_categories',
  'list_rules',
  'get_sync_status',
  'get_transfer_suggestions',
  'categorize_transaction',
  'create_rule',
  'update_rule',
  'delete_rule',
  'apply_rule',
  'set_budget_allocation',
  'set_default_allocation',
  'confirm_transfer',
  'dismiss_transfer',
  'trigger_sync',
  'create_category_group',
  'create_category',
  'WebSearch',
];

describe('getToolLabel', () => {
  it('returns human-readable labels for known query tools', () => {
    expect(getToolLabel('get_account_balances')).toBe('Checking account balances...');
    expect(getToolLabel('get_budget_summary')).toBe('Reviewing your budget...');
    expect(getToolLabel('list_transactions')).toBe('Looking up transactions...');
    expect(getToolLabel('get_sync_status')).toBe('Checking sync status...');
  });

  it('returns human-readable labels for known action tools', () => {
    expect(getToolLabel('categorize_transaction')).toBe('Categorizing transaction...');
    expect(getToolLabel('create_rule')).toBe('Creating rule...');
    expect(getToolLabel('trigger_sync')).toBe('Syncing accounts...');
    expect(getToolLabel('set_budget_allocation')).toBe('Setting budget allocation...');
  });

  it('has explicit labels for all 25 known tools', () => {
    for (const tool of KNOWN_TOOLS) {
      const label = getToolLabel(tool);
      // Should NOT use fallback pattern for known tools
      expect(label).not.toMatch(/^Working on /);
      expect(label).toMatch(/\.\.\.$/);
    }
  });

  it('returns formatted fallback for unknown tools', () => {
    expect(getToolLabel('unknown_future_tool')).toBe('Working on unknown future tool...');
    expect(getToolLabel('some_new_action')).toBe('Working on some new action...');
  });

  it('returns generic label for empty string', () => {
    expect(getToolLabel('')).toBe('Working...');
  });
});
