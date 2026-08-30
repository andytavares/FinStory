import { describe, it, expect } from 'vitest';
import { RETENTION_MONTHS, retentionCutoff, isWithinRetention, prunable } from '@main/data/retention';

describe('retention policy (FR-050)', () => {
  it('retains at least 24 months', () => {
    expect(RETENTION_MONTHS).toBeGreaterThanOrEqual(24);
  });

  it('computes a cutoff 24 months back', () => {
    expect(retentionCutoff(new Date('2026-08-29T00:00:00Z')).toISOString().slice(0, 7)).toBe('2024-08');
  });

  it('keeps a transaction from last month', () => {
    expect(isWithinRetention(new Date('2026-07-15'), new Date('2026-08-29'))).toBe(true);
  });

  it('keeps a transaction from 23 months ago', () => {
    expect(isWithinRetention(new Date('2024-10-01'), new Date('2026-08-29'))).toBe(true);
  });

  it('never prunes anything inside the retention window', () => {
    const rows = [
      { id: 'a', postedDate: '2026-08-01' },
      { id: 'b', postedDate: '2025-01-01' },
      { id: 'c', postedDate: '2024-09-01' },
    ];
    expect(prunable(rows, new Date('2026-08-29'))).toHaveLength(0);
  });

  it('identifies rows outside the window as prunable', () => {
    const rows = [
      { id: 'old', postedDate: '2020-01-01' },
      { id: 'new', postedDate: '2026-08-01' },
    ];
    expect(prunable(rows, new Date('2026-08-29')).map((r) => r.id)).toEqual(['old']);
  });
});
