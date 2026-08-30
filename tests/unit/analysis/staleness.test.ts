import { describe, it, expect } from 'vitest';
import { assessCompleteness, INSTITUTION_STALE_AFTER_HOURS } from '@main/plaid/health';
import type { InstitutionState } from '@main/plaid/health';

const now = new Date('2026-08-29T12:00:00Z');

function inst(o: Partial<InstitutionState> = {}): InstitutionState {
  return {
    id: 'inst_1',
    name: 'Chase',
    status: 'healthy',
    lastSyncedAt: new Date('2026-08-29T10:00:00Z'),
    ...o,
  };
}

describe('completeness assessment (FR-009, SC-014)', () => {
  it('reports complete when every institution is fresh', () => {
    const r = assessCompleteness([inst()], now);
    expect(r.dataComplete).toBe(true);
    expect(r.staleInstitutions).toHaveLength(0);
  });

  it('reports incomplete when an institution needs re-auth', () => {
    const r = assessCompleteness([inst({ status: 'reauth_required' })], now);
    expect(r.dataComplete).toBe(false);
    expect(r.staleInstitutions).toEqual(['Chase']);
  });

  it('reports incomplete when a feed has gone stale', () => {
    const stale = inst({
      lastSyncedAt: new Date(now.getTime() - (INSTITUTION_STALE_AFTER_HOURS + 1) * 3_600_000),
    });
    expect(assessCompleteness([stale], now).dataComplete).toBe(false);
  });

  it('reports incomplete when an institution has never synced', () => {
    expect(assessCompleteness([inst({ lastSyncedAt: null })], now).dataComplete).toBe(false);
  });

  it('names every stale institution, not just the first', () => {
    const r = assessCompleteness(
      [inst({ id: 'a', name: 'Chase', status: 'error' }), inst({ id: 'b', name: 'Amex', status: 'reauth_required' })],
      now,
    );
    expect(r.staleInstitutions.sort()).toEqual(['Amex', 'Chase']);
  });

  it('treats no connected institutions as incomplete rather than complete', () => {
    expect(assessCompleteness([], now).dataComplete).toBe(false);
  });
});

describe('Plaid error to status mapping', () => {
  it('maps re-auth codes to reauth_required', async () => {
    const { statusFromPlaidError } = await import('@main/plaid/health');
    expect(statusFromPlaidError('ITEM_LOGIN_REQUIRED')).toBe('reauth_required');
    expect(statusFromPlaidError('PENDING_EXPIRATION')).toBe('reauth_required');
  });

  it('maps other codes to error', async () => {
    const { statusFromPlaidError } = await import('@main/plaid/health');
    expect(statusFromPlaidError('INTERNAL_SERVER_ERROR')).toBe('error');
  });

  it('maps no error to healthy', async () => {
    const { statusFromPlaidError } = await import('@main/plaid/health');
    expect(statusFromPlaidError(null)).toBe('healthy');
  });
});
