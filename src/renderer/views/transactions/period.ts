export interface Period {
  readonly key: string;
  readonly start: string;
  readonly end: string;
}

export const PERIOD_OPTIONS = [
  { value: 'month', label: 'This month' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: 'year', label: 'This year' },
] as const;

/** Resolved once when chosen, so the query payload stays stable between renders. */
export function periodFor(key: string, now: Date = new Date()): Period {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (key === 'month') start.setDate(1);
  else if (key === 'year') start.setMonth(0, 1);
  else start.setDate(start.getDate() - Number(key));
  return { key, start: start.toISOString(), end: now.toISOString() };
}
