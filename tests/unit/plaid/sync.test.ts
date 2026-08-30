import { describe, it, expect } from 'vitest';
import { runSyncLoop } from '@main/plaid/sync';
import type { SyncClient, SyncPageResponse } from '@main/plaid/sync';

function page(n: number, hasMore: boolean): SyncPageResponse {
  return {
    added: [{ transaction_id: `p${n}` }],
    modified: [],
    removed: [],
    next_cursor: `cursor_${n}`,
    has_more: hasMore,
  } as unknown as SyncPageResponse;
}

describe('sync loop: cursor pagination (research.md R2)', () => {
  it('pages until has_more is false', async () => {
    let calls = 0;
    const client: SyncClient = {
      async sync() {
        calls += 1;
        return page(calls, calls < 3);
      },
    };
    const committed: string[] = [];
    const r = await runSyncLoop(client, null, async (_p, cursor) => {
      committed.push(cursor);
    });
    expect(calls).toBe(3);
    expect(r.finalCursor).toBe('cursor_3');
    expect(r.pagesProcessed).toBe(3);
  });

  it('commits the cursor with each page, so a crash resumes rather than skips', async () => {
    let calls = 0;
    const client: SyncClient = {
      async sync() {
        calls += 1;
        return page(calls, calls < 3);
      },
    };
    const committed: string[] = [];
    await runSyncLoop(client, null, async (_p, cursor) => {
      committed.push(cursor);
    });
    expect(committed).toEqual(['cursor_1', 'cursor_2', 'cursor_3']);
  });

  it('does NOT advance the cursor when the commit fails', async () => {
    const client: SyncClient = { async sync() { return page(1, false); } };
    await expect(
      runSyncLoop(client, null, async () => {
        throw new Error('database locked');
      }),
    ).rejects.toThrow(/database locked/);
  });

  it('resumes from a stored cursor — the catch-up path (FR-056)', async () => {
    const seen: Array<string | null> = [];
    const client: SyncClient = {
      async sync(cursor) {
        seen.push(cursor);
        return page(1, false);
      },
    };
    await runSyncLoop(client, 'cursor_from_last_week', async () => {});
    expect(seen[0]).toBe('cursor_from_last_week');
  });

  it('stops at the page cap rather than looping forever on a broken cursor', async () => {
    const client: SyncClient = { async sync() { return page(1, true); } };
    const r = await runSyncLoop(client, null, async () => {}, { maxPages: 5 });
    expect(r.pagesProcessed).toBe(5);
    expect(r.stoppedAtCap).toBe(true);
  });
});
