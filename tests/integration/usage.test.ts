import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: () => tmpdir() } }));

const { openDatabase } = await import('@main/db/client');
const { runMigrations } = await import('@main/db/migrate');
const schema = await import('@main/db/schema');
const { UsageRecorder } = await import('@main/usage/recorder');
const { usageSummary, recentUsage, usageCsv } = await import('@main/usage/queries');
const { DatabaseSink } = await import('@main/diagnostics/sink');
const { DiagnosticLogger, DiagnosticEventType, Outcome } = await import('@main/diagnostics/logger');
const { TestClock } = await import('@shared/clock');
const { FEATURES } = await import('@shared/features');
import type { DatabaseHandle } from '@main/db/client';
import { MemorySecretStore } from '../fixtures/memory-secret-store';

const NOW = new Date('2026-08-29T12:00:00Z');
const daysAgo = (days: number): string => new Date(NOW.getTime() - days * 86_400_000).toISOString();

describe('usage tracking against a real database', () => {
  let dir: string;
  let handle: DatabaseHandle;
  let emitted: Array<{ channel: string; payload: unknown }>;
  let recorder: InstanceType<typeof UsageRecorder>;

  const seed = (feature: string, days: number): Promise<unknown> =>
    Promise.resolve(
      handle.db
        .insert(schema.usageEvents)
        .values({ occurredAt: daysAgo(days), feature, kind: 'view', outcome: 'success' })
        .run(),
    );

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'money-usage-'));
    handle = await openDatabase(dir, new MemorySecretStore());
    runMigrations(handle, join(process.cwd(), 'src/main/db/migrations'));
    emitted = [];
    recorder = new UsageRecorder(handle.db, new TestClock(NOW), (channel, payload) =>
      emitted.push({ channel, payload }),
    );
  });

  afterEach(() => {
    handle.close();
    rmSync(dir, { recursive: true, force: true });
  });

  describe('recorder', () => {
    it('drops an unknown feature and stores nothing', async () => {
      await recorder.record({ feature: 'Uber Eats', kind: 'action', outcome: 'success' });
      expect(await handle.db.select().from(schema.usageEvents)).toEqual([]);
      expect(emitted).toEqual([]);
    });

    it('stores a known feature and emits it with its label', async () => {
      await recorder.record({ feature: 'view:dashboard', kind: 'view', outcome: 'success', durationMs: 5 });
      const rows = await handle.db.select().from(schema.usageEvents);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ feature: 'view:dashboard', kind: 'view', outcome: 'success', durationMs: 5 });
      expect(emitted).toHaveLength(1);
      expect(emitted[0]?.channel).toBe('usage:event');
      expect(emitted[0]?.payload).toMatchObject({ feature: 'view:dashboard', label: 'Dashboard' });
    });

    it('records a failure and rethrows when a tracked call throws', async () => {
      await expect(
        recorder.track('sync:now', 'action', () => Promise.reject(new Error('boom'))),
      ).rejects.toThrow('boom');
      const rows = await handle.db.select().from(schema.usageEvents);
      expect(rows[0]).toMatchObject({ feature: 'sync:now', outcome: 'failure' });
    });

    it('keeps 364-day rows and deletes 366-day rows by default', async () => {
      await seed('view:health', 364);
      await seed('view:alerts', 366);
      await recorder.prune(NOW, '365');
      const rows = await handle.db.select().from(schema.usageEvents);
      expect(rows.map((r) => r.feature)).toEqual(['view:health']);
    });

    it('keeps everything when retention is forever', async () => {
      await seed('view:health', 364);
      await seed('view:alerts', 366);
      await recorder.prune(NOW, 'forever');
      expect(await handle.db.select().from(schema.usageEvents)).toHaveLength(2);
    });
  });

  describe('queries', () => {
    it('counts the period, the previous period, and the distinct days', async () => {
      await seed('view:dashboard', 1);
      await seed('view:dashboard', 1);
      await seed('view:health', 2);
      await seed('view:health', 10);
      const summary = await usageSummary(handle.db, 7, NOW);
      expect(summary.totalEvents).toBe(3);
      expect(summary.previousTotal).toBe(1);
      expect(summary.activeDays).toBe(2);
      expect(summary.featuresUsed).toBe(2);
      expect(summary.featuresTotal).toBe(FEATURES.length);
      expect(summary.daily.reduce((sum, d) => sum + d.count, 0)).toBe(3);
    });

    it('lists unused features and includes zeros in byFeature, most used first', async () => {
      await seed('view:dashboard', 1);
      await seed('view:dashboard', 1);
      await seed('view:health', 1);
      const summary = await usageSummary(handle.db, null, NOW);
      expect(summary.byFeature).toHaveLength(FEATURES.length);
      expect(summary.byFeature.slice(0, 2)).toEqual([
        { id: 'view:dashboard', label: 'Dashboard', count: 2 },
        { id: 'view:health', label: 'Health', count: 1 },
      ]);
      expect(summary.byFeature.at(-1)?.count).toBe(0);
      expect(summary.neverUsed).toHaveLength(FEATURES.length - 2);
      expect(summary.neverUsed.some((f) => f.id === 'view:dashboard')).toBe(false);
    });

    it('returns the newest rows first with labels, and a CSV with a header', async () => {
      await seed('view:health', 3);
      await seed('view:dashboard', 1);
      const recent = await recentUsage(handle.db, 10);
      expect(recent.map((r) => r.label)).toEqual(['Dashboard', 'Health']);
      const csv = await usageCsv(handle.db);
      expect(csv.split('\n')[0]).toBe('occurred_at,feature,kind,outcome,duration_ms');
      expect(csv.split('\n')).toHaveLength(3);
    });
  });

  describe('database-backed diagnostic sink', () => {
    it('writes an enumerated event', async () => {
      const log = new DiagnosticLogger(new DatabaseSink(handle.db), new TestClock(NOW));
      log.record({ type: DiagnosticEventType.SyncAttempt, outcome: Outcome.Success, subjectId: 'inst_01H8XYZ', durationMs: 412 });
      const rows = await handle.db.select().from(schema.diagnosticEvents);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ eventType: 'sync_attempt', subjectId: 'inst_01H8XYZ', durationMs: 412 });
    });

    it('still rejects free text and writes nothing', async () => {
      const log = new DiagnosticLogger(new DatabaseSink(handle.db), new TestClock(NOW));
      expect(() =>
        log.record({ type: DiagnosticEventType.SyncAttempt, outcome: Outcome.Success, subjectId: 'Uber Eats' }),
      ).toThrow(TypeError);
      expect(await handle.db.select().from(schema.diagnosticEvents)).toEqual([]);
    });
  });
});
