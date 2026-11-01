import { lt } from 'drizzle-orm';
import type { DatabaseHandle } from '@main/db/client';
import { usageEvents } from '@main/db/schema';
import type { Clock } from '@shared/clock';
import { featureLabel, isFeature, type FeatureKind } from '@shared/features';

export type UsageRetention = '365' | 'forever';

export interface UsageInput {
  readonly feature: string;
  readonly kind: FeatureKind;
  readonly outcome: 'success' | 'failure';
  readonly durationMs?: number;
}

/** A stored event as the renderer sees it. */
export function toUsageRow(row: typeof usageEvents.$inferSelect): Record<string, unknown> {
  return { ...row, label: featureLabel(row.feature) };
}

/** Local usage log. Only catalog feature ids are stored, so no free text reaches the table. Nothing leaves the machine. */
export class UsageRecorder {
  constructor(
    private readonly db: DatabaseHandle['db'],
    private readonly clock: Clock,
    private readonly emit: (channel: string, payload: unknown) => void,
  ) {}

  /** Never throws: tracking must not break the feature it measures, and the database may be closed. */
  async record(input: UsageInput): Promise<void> {
    if (!isFeature(input.feature)) return;
    try {
      const row = this.db
        .insert(usageEvents)
        .values({
          occurredAt: this.clock.now().toISOString(),
          feature: input.feature,
          kind: input.kind,
          outcome: input.outcome,
          durationMs: input.durationMs ?? null,
        })
        .returning()
        .get();
      this.emit('usage:event', toUsageRow(row));
    } catch {
      /* dropped */
    }
  }

  /** Time `run`, record how it ended, and pass its result or error through. */
  async track<T>(feature: string, kind: FeatureKind, run: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      const result = await run();
      await this.record({ feature, kind, outcome: 'success', durationMs: Date.now() - start });
      return result;
    } catch (error) {
      await this.record({ feature, kind, outcome: 'failure', durationMs: Date.now() - start });
      throw error;
    }
  }

  async prune(now: Date, retention: UsageRetention): Promise<void> {
    if (retention === 'forever') return;
    const cutoff = new Date(now.getTime() - 365 * 86_400_000).toISOString();
    await this.db.delete(usageEvents).where(lt(usageEvents.occurredAt, cutoff));
  }
}
