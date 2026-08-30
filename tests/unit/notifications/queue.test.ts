import { describe, it, expect } from 'vitest';
import { NotificationQueue } from '@main/notifications/queue';

describe('undelivered notifications are retained, not lost (FR-034)', () => {
  it('delivers when the channel works', async () => {
    const sent: string[] = [];
    const q = new NotificationQueue({ deliver: async (n) => void sent.push(n.title) });
    await q.push({ id: 'n1', title: 'Large purchase', body: 'x', occurredAt: '2026-08-29T12:00:00Z' });
    expect(sent).toEqual(['Large purchase']);
    expect(q.pending()).toHaveLength(0);
  });

  it('retains a notification when delivery fails', async () => {
    const q = new NotificationQueue({
      deliver: async () => {
        throw new Error('no channel');
      },
    });
    await q.push({ id: 'n1', title: 'Large purchase', body: 'x', occurredAt: '2026-08-29T12:00:00Z' });
    expect(q.pending()).toHaveLength(1);
  });

  it('redelivers retained notifications on retry', async () => {
    let working = false;
    const sent: string[] = [];
    const q = new NotificationQueue({
      deliver: async (n) => {
        if (!working) throw new Error('no channel');
        sent.push(n.id);
      },
    });
    await q.push({ id: 'n1', title: 'a', body: 'b', occurredAt: '2026-08-29T12:00:00Z' });
    working = true;
    await q.flush();
    expect(sent).toEqual(['n1']);
    expect(q.pending()).toHaveLength(0);
  });

  it('does not deliver the same notification twice', async () => {
    const sent: string[] = [];
    const q = new NotificationQueue({ deliver: async (n) => void sent.push(n.id) });
    await q.push({ id: 'n1', title: 'a', body: 'b', occurredAt: '2026-08-29T12:00:00Z' });
    await q.push({ id: 'n1', title: 'a', body: 'b', occurredAt: '2026-08-29T12:00:00Z' });
    expect(sent).toEqual(['n1']);
  });
});

describe('queue ordering and partial failure', () => {
  it('stops flushing at the first failure so order is preserved', async () => {
    const sent: string[] = [];
    let failAfter = 1;
    const q = new NotificationQueue({
      deliver: async (n) => {
        if (sent.length >= failAfter) throw new Error('channel down');
        sent.push(n.id);
      },
    });
    await q.push({ id: 'n1', title: 'a', body: 'b', occurredAt: '2026-08-29T12:00:00Z' });
    await q.push({ id: 'n2', title: 'a', body: 'b', occurredAt: '2026-08-29T12:01:00Z' });
    expect(sent).toEqual(['n1']);
    expect(q.pending().map((n) => n.id)).toEqual(['n2']);

    failAfter = 99;
    await q.flush();
    expect(sent).toEqual(['n1', 'n2']);
  });

  it('flushing an empty queue is a no-op', async () => {
    const q = new NotificationQueue({ deliver: async () => {} });
    await q.flush();
    expect(q.pending()).toHaveLength(0);
  });
});
