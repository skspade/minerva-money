import { describe, it, expect } from 'vitest';
import { getSystemPrompt } from './system-prompt.js';

describe('getSystemPrompt', () => {
  const prompt = getSystemPrompt();

  it('includes Category Management section', () => {
    expect(prompt).toContain('## Category Management');
  });

  it('instructs agent to check for existing categories before creating (SYS-04)', () => {
    expect(prompt).toContain('list_categories');
    expect(prompt).toMatch(/before creating.*list_categories|list_categories.*before creat/is);
  });

  it('requires confirmation block for category group creation (SYS-02)', () => {
    expect(prompt).toContain('create_category_group');
    expect(prompt).toContain('"action": "create_category_group"');
  });

  it('requires confirmation block for category creation (SYS-02)', () => {
    expect(prompt).toContain('create_category');
    expect(prompt).toContain('"action": "create_category"');
  });

  it('instructs agent to redirect delete/rename to Categories page (SYS-03)', () => {
    expect(prompt).toMatch(/cannot.*(delete|rename)/i);
    expect(prompt).toContain('Categories page');
  });

  it('documents both creation tools (SYS-01)', () => {
    expect(prompt).toContain('create_category_group');
    expect(prompt).toContain('create_category');
  });

  it("appends today's date", () => {
    const today = new Date().toISOString().split('T')[0];
    expect(prompt).toContain(`Today's date: ${today}`);
  });

  it('includes Account Management section', () => {
    expect(prompt).toContain('## Account Management');
  });

  it('requires confirmation block for account creation', () => {
    expect(prompt).toContain('create_account');
    expect(prompt).toContain('"action": "create_account"');
  });

  it('instructs agent to check existing accounts before creating', () => {
    expect(prompt).toContain('get_account_balances');
    expect(prompt).toMatch(/before creating.*get_account_balances|get_account_balances.*before creat/is);
  });

  it('explains manual accounts are for non-SimpleFIN institutions', () => {
    expect(prompt).toContain('SimpleFIN');
    expect(prompt).toMatch(/manual account.*not available|not available.*SimpleFIN/is);
  });
});
