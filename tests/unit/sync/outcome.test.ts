import { describe, it, expect } from 'vitest';
import { summarizeSync, EMPTY_SYNC } from '@main/sync/outcome';

describe('summarizeSync tells the truth about what a sync run did', () => {
  it('says so when nothing is connected', () => {
    const s = summarizeSync({ ...EMPTY_SYNC, blocked: 'no_institutions' });
    expect(s.ok).toBe(false);
    expect(s.message).toMatch(/No accounts connected/);
  });

  it('says so when the Plaid credentials are missing', () => {
    const s = summarizeSync({ ...EMPTY_SYNC, blocked: 'no_credentials' });
    expect(s.ok).toBe(false);
    expect(s.message).toMatch(/credentials are missing/);
  });

  it('surfaces the real error when every institution failed', () => {
    const s = summarizeSync({
      ...EMPTY_SYNC,
      institutionCount: 1,
      failures: ['INVALID_API_KEYS: client_id / secret mismatch'],
    });
    expect(s.ok).toBe(false);
    expect(s.message).toContain('INVALID_API_KEYS');
  });

  it('reports counts on a successful run', () => {
    const s = summarizeSync({ ...EMPTY_SYNC, institutionCount: 1, added: 42, updated: 3 });
    expect(s.ok).toBe(true);
    expect(s.message).toBe('Synced: 42 new transactions, 3 updated.');
    expect(s.warning).toBeNull();
  });

  it('says "nothing new" rather than staying silent', () => {
    const s = summarizeSync({ ...EMPTY_SYNC, institutionCount: 1 });
    expect(s.ok).toBe(true);
    expect(s.message).toBe('Synced. Nothing new.');
  });

  it('singularizes a single transaction', () => {
    const s = summarizeSync({ ...EMPTY_SYNC, institutionCount: 1, added: 1 });
    expect(s.message).toBe('Synced: 1 new transaction.');
  });

  it('warns about a model failure even when ingestion succeeded', () => {
    const s = summarizeSync({
      ...EMPTY_SYNC,
      institutionCount: 1,
      added: 10,
      modelFailures: 10,
      modelError: '401 invalid x-api-key',
    });
    expect(s.ok).toBe(true);
    expect(s.warning).toContain('401 invalid x-api-key');
    expect(s.warning).toContain('10 transactions');
  });

  it('warns about a partial institution failure', () => {
    const s = summarizeSync({
      ...EMPTY_SYNC,
      institutionCount: 2,
      added: 5,
      failures: ['ITEM_LOGIN_REQUIRED'],
    });
    expect(s.ok).toBe(true);
    expect(s.warning).toContain('ITEM_LOGIN_REQUIRED');
  });

  it('reports transactions dropped for an unknown account', () => {
    const s = summarizeSync({ ...EMPTY_SYNC, institutionCount: 1, added: 2, skipped: 3 });
    expect(s.warning).toContain('3 transactions skipped');
  });
});
