import type { CadenceInput } from '@main/analysis/cadence';

/** Build a run of evenly-spaced occurrences, e.g. a monthly subscription. */
export function series(opts: {
  start: string;
  count: number;
  everyDays: number;
  amountMinor: number;
  jitterDays?: number;
  amountJitterMinor?: number;
}): CadenceInput[] {
  const out: CadenceInput[] = [];
  const start = new Date(opts.start).getTime();
  const day = 86_400_000;
  for (let i = 0; i < opts.count; i += 1) {
    const jitter = opts.jitterDays ? ((i % 3) - 1) * opts.jitterDays * day : 0;
    const amtJitter = opts.amountJitterMinor ? ((i % 3) - 1) * opts.amountJitterMinor : 0;
    out.push({
      occurredAt: new Date(start + i * opts.everyDays * day + jitter),
      amountMinor: opts.amountMinor + amtJitter,
    });
  }
  return out;
}

/** Build irregular occurrences — the decoy a grocery store produces. */
export function irregular(opts: {
  start: string;
  offsetsDays: number[];
  amountsMinor: number[];
}): CadenceInput[] {
  const start = new Date(opts.start).getTime();
  return opts.offsetsDays.map((d, i) => ({
    occurredAt: new Date(start + d * 86_400_000),
    amountMinor: opts.amountsMinor[i % opts.amountsMinor.length] ?? 0,
  }));
}
