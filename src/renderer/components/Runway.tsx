import { Money } from './Money';

/**
 * The runway strip.
 *
 * The signature element of the dashboard, and the one thing the whole product
 * is about: does the balance survive to the next payday. Everything else on the
 * page is a category total; this is the answer to the actual question.
 *
 * Constitution IX: when income is unknown the strip does not guess. It says so.
 */
export function Runway({
  available,
  currentBalanceMinor,
  projectedMinor,
  floorMinor,
  nextIncomeDate,
  reason,
}: {
  available: boolean;
  currentBalanceMinor: number;
  projectedMinor: number | null;
  floorMinor: number;
  nextIncomeDate: string | null;
  reason: string;
}): React.JSX.Element {
  if (!available || projectedMinor === null) {
    return (
      <section className="border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
        <p className="eyebrow">Runway</p>
        <p className="mt-2 text-[15px] text-[var(--color-ink-muted)]">{reason}</p>
      </section>
    );
  }

  const breaches = projectedMinor < floorMinor;
  // Proportion of the current balance still standing at payday.
  const remaining = Math.max(0, Math.min(1, projectedMinor / Math.max(currentBalanceMinor, 1)));
  const floorAt = Math.max(0, Math.min(1, floorMinor / Math.max(currentBalanceMinor, 1)));

  return (
    <section className="border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
      <div className="flex items-baseline justify-between">
        <p className="eyebrow">Runway to payday</p>
        <p className="text-[12px] text-[var(--color-ink-faint)]">
          {nextIncomeDate ? new Date(nextIncomeDate).toLocaleDateString() : ''}
        </p>
      </div>

      <div className="mt-4 flex items-baseline gap-3">
        <Money minor={projectedMinor} className="text-[32px] tracking-tight" />
        <span className="text-[13px] text-[var(--color-ink-faint)]">projected at payday</span>
      </div>

      {/* The strip: today at the left, payday at the right, floor marked. */}
      <div className="relative mt-4 h-2 w-full bg-[var(--color-surface-raised)]">
        <div
          className="absolute inset-y-0 left-0"
          style={{
            width: `${remaining * 100}%`,
            background: breaches ? 'var(--color-attention)' : 'var(--color-positive)',
          }}
        />
        <div
          className="absolute inset-y-[-3px] w-px bg-[var(--color-ink-muted)]"
          style={{ left: `${floorAt * 100}%` }}
          aria-hidden
        />
      </div>

      <div className="mt-2 flex justify-between text-[12px] text-[var(--color-ink-faint)]">
        <span>
          now <Money minor={currentBalanceMinor} />
        </span>
        <span>
          floor <Money minor={floorMinor} />
        </span>
      </div>

      {/* FR-041: every projection states its assumption. */}
      <p className="mt-3 text-[12px] text-[var(--color-ink-faint)]">{reason}</p>
    </section>
  );
}
