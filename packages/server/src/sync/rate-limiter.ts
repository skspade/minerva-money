export interface RateLimiter {
  canRequest(accountId: string): boolean;
  canManualSync(accountId: string): boolean;
  increment(accountId: string): void;
  remainingRequests(accountId: string): number;
}

export function createRateLimiter(dailyLimit = 20, manualReserve = 4): RateLimiter {
  const counters = new Map<string, { count: number; date: string }>();

  function today(): string {
    return new Date().toISOString().split('T')[0];
  }

  function getCount(accountId: string): number {
    const entry = counters.get(accountId);
    if (!entry || entry.date !== today()) {
      return 0;
    }
    return entry.count;
  }

  return {
    canRequest(accountId: string): boolean {
      return getCount(accountId) < dailyLimit;
    },

    canManualSync(accountId: string): boolean {
      return dailyLimit - getCount(accountId) >= manualReserve;
    },

    increment(accountId: string): void {
      const currentDate = today();
      const entry = counters.get(accountId);
      if (!entry || entry.date !== currentDate) {
        counters.set(accountId, { count: 1, date: currentDate });
      } else {
        entry.count++;
      }
    },

    remainingRequests(accountId: string): number {
      return dailyLimit - getCount(accountId);
    },
  };
}
