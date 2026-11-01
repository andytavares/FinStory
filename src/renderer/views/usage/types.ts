export interface UsageSummary {
  readonly totalEvents: number;
  readonly previousTotal: number;
  readonly featuresUsed: number;
  readonly featuresTotal: number;
  readonly neverUsed: ReadonlyArray<{ id: string; label: string; group: string }>;
  readonly activeDays: number;
  readonly byFeature: ReadonlyArray<{ id: string; label: string; count: number }>;
  readonly daily: ReadonlyArray<{ date: string; count: number }>;
}

export interface UsageEvent {
  readonly id: number;
  readonly occurredAt: string;
  readonly feature: string;
  readonly label: string;
  readonly outcome: 'success' | 'failure';
  readonly durationMs: number | null;
}
