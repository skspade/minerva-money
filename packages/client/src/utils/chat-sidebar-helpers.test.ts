import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatRelativeTime, groupConversationsByRecency, getModelBadge } from './chat-sidebar-helpers';

describe('formatRelativeTime', () => {
  beforeEach(() => {
    // Fixed time: 2026-03-28 12:00:00 UTC
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-28T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "Just now" for timestamps within last 60 seconds', () => {
    expect(formatRelativeTime('2026-03-28T11:59:30Z')).toBe('Just now');
    expect(formatRelativeTime('2026-03-28T12:00:00Z')).toBe('Just now');
  });

  it('returns minutes ago for timestamps within last hour', () => {
    expect(formatRelativeTime('2026-03-28T11:55:00Z')).toBe('5m ago');
    expect(formatRelativeTime('2026-03-28T11:30:00Z')).toBe('30m ago');
    expect(formatRelativeTime('2026-03-28T11:01:00Z')).toBe('59m ago');
  });

  it('returns hours ago for timestamps within last 24 hours (same day)', () => {
    expect(formatRelativeTime('2026-03-28T10:00:00Z')).toBe('2h ago');
    expect(formatRelativeTime('2026-03-28T01:00:00Z')).toBe('11h ago');
  });

  it('returns "Yesterday" for timestamps from previous calendar day', () => {
    expect(formatRelativeTime('2026-03-27T15:00:00Z')).toBe('Yesterday');
    expect(formatRelativeTime('2026-03-27T01:00:00Z')).toBe('Yesterday');
  });

  it('returns days ago for timestamps within last 7 days', () => {
    expect(formatRelativeTime('2026-03-25T12:00:00Z')).toBe('3d ago');
    expect(formatRelativeTime('2026-03-22T12:00:00Z')).toBe('6d ago');
  });

  it('returns short date for timestamps older than 7 days in same year', () => {
    expect(formatRelativeTime('2026-03-20T12:00:00Z')).toBe('Mar 20');
    expect(formatRelativeTime('2026-01-15T12:00:00Z')).toBe('Jan 15');
  });

  it('returns date with year for timestamps from a different year', () => {
    expect(formatRelativeTime('2025-12-25T12:00:00Z')).toBe('Dec 25, 2025');
    expect(formatRelativeTime('2024-06-01T12:00:00Z')).toBe('Jun 1, 2024');
  });
});

describe('groupConversationsByRecency', () => {
  beforeEach(() => {
    // Fixed time: 2026-03-28 12:00:00 UTC
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-28T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns empty array for empty input', () => {
    expect(groupConversationsByRecency([])).toEqual([]);
  });

  it('groups conversations into correct buckets', () => {
    const conversations = [
      { id: '1', updated_at: '2026-03-28T11:00:00Z' }, // Today
      { id: '2', updated_at: '2026-03-28T08:00:00Z' }, // Today
      { id: '3', updated_at: '2026-03-27T15:00:00Z' }, // Yesterday
      { id: '4', updated_at: '2026-03-24T12:00:00Z' }, // Previous 7 Days (4 days ago)
      { id: '5', updated_at: '2026-03-10T12:00:00Z' }, // Older
    ];

    const groups = groupConversationsByRecency(conversations);

    expect(groups).toHaveLength(4);
    expect(groups[0].label).toBe('Today');
    expect(groups[0].conversations).toHaveLength(2);
    expect(groups[0].conversations[0].id).toBe('1');
    expect(groups[0].conversations[1].id).toBe('2');

    expect(groups[1].label).toBe('Yesterday');
    expect(groups[1].conversations).toHaveLength(1);
    expect(groups[1].conversations[0].id).toBe('3');

    expect(groups[2].label).toBe('Previous 7 Days');
    expect(groups[2].conversations).toHaveLength(1);
    expect(groups[2].conversations[0].id).toBe('4');

    expect(groups[3].label).toBe('Older');
    expect(groups[3].conversations).toHaveLength(1);
    expect(groups[3].conversations[0].id).toBe('5');
  });

  it('omits empty buckets', () => {
    const conversations = [
      { id: '1', updated_at: '2026-03-28T11:00:00Z' }, // Today
      { id: '2', updated_at: '2026-03-10T12:00:00Z' }, // Older
    ];

    const groups = groupConversationsByRecency(conversations);

    expect(groups).toHaveLength(2);
    expect(groups[0].label).toBe('Today');
    expect(groups[1].label).toBe('Older');
  });

  it('preserves original order within each bucket', () => {
    const conversations = [
      { id: 'a', updated_at: '2026-03-28T11:00:00Z' },
      { id: 'b', updated_at: '2026-03-28T10:00:00Z' },
      { id: 'c', updated_at: '2026-03-28T09:00:00Z' },
    ];

    const groups = groupConversationsByRecency(conversations);

    expect(groups[0].conversations.map(c => c.id)).toEqual(['a', 'b', 'c']);
  });

  it('preserves extra fields on conversation objects', () => {
    const conversations = [
      { id: '1', updated_at: '2026-03-28T11:00:00Z', title: 'My Chat', model: 'claude-sonnet-4' },
    ];

    const groups = groupConversationsByRecency(conversations);
    const conv = groups[0].conversations[0] as typeof conversations[0];

    expect(conv.title).toBe('My Chat');
    expect(conv.model).toBe('claude-sonnet-4');
  });
});

describe('getModelBadge', () => {
  it('returns H badge for haiku models', () => {
    const badge = getModelBadge('claude-haiku-3-20240307');
    expect(badge.label).toBe('H');
    expect(badge.colorClass).toContain('bg-gray');
  });

  it('returns S badge for sonnet models', () => {
    const badge = getModelBadge('claude-sonnet-4-20250514');
    expect(badge.label).toBe('S');
    expect(badge.colorClass).toContain('bg-blue');
  });

  it('returns O badge for opus models', () => {
    const badge = getModelBadge('claude-opus-4-20250514');
    expect(badge.label).toBe('O');
    expect(badge.colorClass).toContain('bg-purple');
  });

  it('handles model strings with varying formats', () => {
    expect(getModelBadge('claude-3-5-haiku-20241022').label).toBe('H');
    expect(getModelBadge('claude-3-5-sonnet-20241022').label).toBe('S');
    expect(getModelBadge('claude-3-opus-20240229').label).toBe('O');
  });

  it('returns ? badge for unknown models', () => {
    const badge = getModelBadge('gpt-4o');
    expect(badge.label).toBe('?');
    expect(badge.colorClass).toContain('bg-gray');
  });

  it('returns ? badge for empty string', () => {
    const badge = getModelBadge('');
    expect(badge.label).toBe('?');
  });
});
