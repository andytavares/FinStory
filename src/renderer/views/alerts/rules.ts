export interface AlertRuleView {
  readonly id: string;
  readonly type: string;
  readonly label: string | null;
  readonly thresholdMinor: number | null;
  readonly windowMinutes: number | null;
  readonly enabled: boolean;
  readonly isSystem: boolean;
}

export const RULE_TYPES = [
  { id: 'large_purchase', label: 'A single purchase over', option: 'A single purchase over an amount', needs: 'threshold' },
  { id: 'daily_total', label: 'A day of spending over', option: 'A day of spending over an amount', needs: 'threshold' },
  { id: 'duplicate_charge', label: 'The same charge twice within', option: 'The same charge twice within a window', needs: 'window' },
  { id: 'new_recurring', label: 'A new recurring charge appears', option: 'A new recurring charge appears', needs: 'none' },
  { id: 'balance_floor', label: 'Balance projected below', option: 'Balance projected below an amount', needs: 'threshold' },
] as const;

/** Stripe tone, title and what the triggering charge did, for an alert of each rule type. */
export const ALERT_STYLE: Record<string, { title: string; color: string; verb: string }> = {
  large_purchase: { title: 'Large purchase', color: 'var(--color-negative)', verb: 'charged' },
  daily_total: { title: 'Daily spending over the limit', color: 'var(--color-attention)', verb: 'charged' },
  duplicate_charge: { title: 'Possible duplicate charge', color: 'var(--color-attention)', verb: 'charged twice,' },
  new_recurring: { title: 'New recurring charge', color: 'var(--color-accent)', verb: 'looks recurring at' },
  balance_floor: { title: 'Balance projected low', color: 'var(--color-negative)', verb: 'charged' },
};
