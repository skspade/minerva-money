const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Format a date string as a human-readable relative timestamp.
 * Returns "Just now", "5m ago", "2h ago", "Yesterday", "3d ago", "Mar 20", or "Mar 20, 2025".
 */
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);

  if (diffSeconds < 60) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24 && isSameDay(date, now)) return `${diffHours}h ago`;

  // Check if yesterday (calendar day)
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(date, yesterday)) return 'Yesterday';

  // Within last 7 days
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 7) return `${diffDays}d ago`;

  // Older: show date
  const month = MONTH_NAMES[date.getUTCMonth()];
  const day = date.getUTCDate();

  if (date.getUTCFullYear() !== now.getUTCFullYear()) {
    return `${month} ${day}, ${date.getUTCFullYear()}`;
  }

  return `${month} ${day}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/**
 * Group conversations by recency buckets: Today, Yesterday, Previous 7 Days, Older.
 * Empty buckets are omitted. Preserves original order within each bucket.
 */
export function groupConversationsByRecency<T extends { updated_at: string }>(
  conversations: T[],
): { label: string; conversations: T[] }[] {
  if (conversations.length === 0) return [];

  const now = new Date();
  const today = startOfDayUTC(now);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6); // 6 because yesterday is already separate

  const buckets: { label: string; conversations: T[] }[] = [
    { label: 'Today', conversations: [] },
    { label: 'Yesterday', conversations: [] },
    { label: 'Previous 7 Days', conversations: [] },
    { label: 'Older', conversations: [] },
  ];

  for (const conv of conversations) {
    const date = new Date(conv.updated_at);
    if (date >= today) {
      buckets[0].conversations.push(conv);
    } else if (date >= yesterday) {
      buckets[1].conversations.push(conv);
    } else if (date >= sevenDaysAgo) {
      buckets[2].conversations.push(conv);
    } else {
      buckets[3].conversations.push(conv);
    }
  }

  return buckets.filter(b => b.conversations.length > 0);
}

function startOfDayUTC(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Map a model ID string to a single-letter badge and Tailwind color class.
 */
export function getModelBadge(model: string): { label: string; colorClass: string } {
  if (model.includes('haiku')) return { label: 'H', colorClass: 'bg-gray-200 text-gray-600' };
  if (model.includes('sonnet')) return { label: 'S', colorClass: 'bg-blue-100 text-blue-700' };
  if (model.includes('opus')) return { label: 'O', colorClass: 'bg-purple-100 text-purple-700' };
  return { label: '?', colorClass: 'bg-gray-200 text-gray-600' };
}
