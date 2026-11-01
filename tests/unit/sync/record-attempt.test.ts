import { describe, it, expect } from 'vitest';
import { recordSyncAttempt } from '@main/sync/record-attempt';
import { DiagnosticLogger } from '@main/diagnostics/logger';
import { MemorySink } from '@main/diagnostics/sink';
import { TestClock } from '@shared/clock';

describe('recordSyncAttempt', () => {
  const setup = (): { sink: MemorySink; logger: DiagnosticLogger } => {
    const sink = new MemorySink();
    return { sink, logger: new DiagnosticLogger(sink, new TestClock(new Date('2026-08-29T12:00:00Z'))) };
  };

  it('records a successful run with its duration', async () => {
    const { sink, logger } = setup();
    await recordSyncAttempt(logger, async () => ({ failures: [] }));
    expect(sink.events).toMatchObject([{ type: 'sync_attempt', outcome: 'success' }]);
    expect(sink.events[0]?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('records a failed run and rethrows', async () => {
    const { sink, logger } = setup();
    await expect(
      recordSyncAttempt(logger, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(sink.events).toMatchObject([{ type: 'sync_attempt', outcome: 'failure' }]);
  });

  it('records a run with failed institutions as a failure', async () => {
    const { sink, logger } = setup();
    await recordSyncAttempt(logger, async () => ({ failures: ['Chase'] }));
    expect(sink.events).toMatchObject([{ outcome: 'failure' }]);
  });
});
