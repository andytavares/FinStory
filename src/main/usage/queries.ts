import { desc, gte } from 'drizzle-orm';
import type { DatabaseHandle } from '@main/db/client';
import { usageEvents } from '@main/db/schema';
import { FEATURES } from '@shared/features';
import { toUsageRow } from './recorder';

type Db = DatabaseHandle['db'];
const DAY_MS = 86_400_000;

export interface UsageSummary {
  readonly totalEvents: number;
  readonly previousTotal: number;
  readonly featuresUsed: number;
  readonly featuresTotal: number;
  readonly neverUsed: ReadonlyArray<{ id: string; label: string; group: string }>;
  readonly activeDays: number;
  readonly byFeature: ReadonlyArray<{ id: string; label: string; count: number }>;
  readonly daily: ReadonlyArray<{ date: string; count: number }>;
}

function countBy<T>(items: readonly T[], key: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return counts;
}

/** `days` null means all time. Days are UTC calendar days of the stored timestamp. */
export async function usageSummary(db: Db, days: 7 | 30 | null, now: Date): Promise<UsageSummary> {
  const since = days === null ? null : new Date(now.getTime() - days * DAY_MS).toISOString();
  const previousSince = days === null ? null : new Date(now.getTime() - 2 * days * DAY_MS).toISOString();
  const rows = await db
    .select()
    .from(usageEvents)
    .where(previousSince === null ? undefined : gte(usageEvents.occurredAt, previousSince));
  const current = since === null ? rows : rows.filter((row) => row.occurredAt >= since);

  const perFeature = countBy(current, (row) => row.feature);
  const perDay = countBy(current, (row) => row.occurredAt.slice(0, 10));
  return {
    totalEvents: current.length,
    previousTotal: rows.length - current.length,
    featuresUsed: FEATURES.filter((f) => perFeature.has(f.id)).length,
    featuresTotal: FEATURES.length,
    neverUsed: FEATURES.filter((f) => !perFeature.has(f.id)).map(({ id, label, group }) => ({ id, label, group })),
    activeDays: perDay.size,
    byFeature: FEATURES.map((f) => ({ id: f.id, label: f.label, count: perFeature.get(f.id) ?? 0 })).sort(
      (a, b) => b.count - a.count,
    ),
    daily: [...perDay].map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export async function recentUsage(db: Db, limit: number): Promise<Array<Record<string, unknown>>> {
  const rows = await db.select().from(usageEvents).orderBy(desc(usageEvents.id)).limit(limit);
  return rows.map(toUsageRow);
}

export async function usageCsv(db: Db): Promise<string> {
  const rows = await db.select().from(usageEvents).orderBy(usageEvents.id);
  const lines = rows.map((r) => [r.occurredAt, r.feature, r.kind, r.outcome, r.durationMs ?? ''].join(','));
  return ['occurred_at,feature,kind,outcome,duration_ms', ...lines].join('\n');
}
