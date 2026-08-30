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

describe('queue deduplication after delivery', () => {
  it('does not requeue a notification already delivered', async () => {
    const sent: string[] = [];
    const q = new NotificationQueue({ deliver: async (n) => void sent.push(n.id) });
    await q.push({ id: 'n1', title: 'a', body: 'b', occurredAt: '2026-08-29T12:00:00Z' });
    await q.flush();
    await q.push({ id: 'n1', title: 'a', body: 'b', occurredAt: '2026-08-29T12:00:00Z' });
    expect(sent).toEqual(['n1']);
  });

  it('keeps a pending notification pending across repeated failures', async () => {
    const q = new NotificationQueue({
      deliver: async () => {
        throw new Error('down');
      },
    });
    await q.push({ id: 'n1', title: 'a', body: 'b', occurredAt: '2026-08-29T12:00:00Z' });
    await q.flush();
    await q.flush();
    expect(q.pending()).toHaveLength(1);
  });
});

describe('queue behaviour under mixed outcomes', () => {
  it('delivers what it can and retains the rest in order', async () => {
    const sent: string[] = [];
    let blockAfter = 2;
    const q = new NotificationQueue({
      deliver: async (n) => {
        if (sent.length >= blockAfter) throw new Error('channel down');
        sent.push(n.id);
      },
    });
    for (const id of ['n1', 'n2', 'n3', 'n4']) {
      await q.push({ id, title: 't', body: 'b', occurredAt: '2026-08-29T12:00:00Z' });
    }
    expect(sent).toEqual(['n1', 'n2']);
    expect(q.pending().map((n) => n.id)).toEqual(['n3', 'n4']);

    blockAfter = 99;
    await q.flush();
    expect(sent).toEqual(['n1', 'n2', 'n3', 'n4']);
    expect(q.pending()).toHaveLength(0);
  });
});
