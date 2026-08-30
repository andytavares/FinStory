/**
 * All time-dependent code takes a Clock rather than calling Date.now().
 *
 * Constitution Principle V: tests that depend on the real system clock are
 * non-deterministic and must not be written. This matters more than usual here
 * because the product's correctness is defined by catch-up across arbitrary
 * gaps — cadence detection, period boundaries, downtime replay — all of which
 * must be exercised against controlled time.
 */
export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

/** Controllable clock for tests. Moves forward only, like real time. */
export class TestClock implements Clock {
  #current: number;

  constructor(start: Date) {
    this.#current = start.getTime();
  }

  now(): Date {
    // Copy: a caller mutating the returned Date must not alter clock state.
    return new Date(this.#current);
  }

  advanceMs(ms: number): void {
    if (ms < 0) {
      throw new RangeError('Clock cannot move backwards');
    }
    this.#current += ms;
  }

  setTo(instant: Date): void {
    if (instant.getTime() < this.#current) {
      throw new RangeError('Clock cannot move backwards');
    }
    this.#current = instant.getTime();
  }
}
