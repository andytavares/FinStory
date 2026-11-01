import { useState } from 'react';
import { useQuery, call } from '../lib/ipc';
import { EmptyState } from '../components/EmptyState';
import { Button, Card, PageHeader } from '../components/ui';
import { money, shortDate } from '../lib/format';
import type { AlertView } from '@shared/types';
import { AddRule } from './alerts/AddRule';
import { RuleRow } from './alerts/RuleRow';
import { ALERT_STYLE, type AlertRuleView } from './alerts/rules';

const LATE_MS = 60 * 60 * 1000;

interface AlertRowProps {
  readonly alert: AlertView;
  readonly onDismissed: () => void;
  readonly onOpen: (merchantName: string) => void;
}

function AlertText({ alert }: { alert: AlertView }): React.JSX.Element {
  const style = ALERT_STYLE[alert.type] ?? { title: alert.type, color: 'var(--color-ink-faint)', verb: 'charged' };
  // Both times are shown, so a replayed alert is never mistaken for a live one (FR-057).
  const late = new Date(alert.detectedAt).getTime() - new Date(alert.eventOccurredAt).getTime() > LATE_MS;
  return (
    <>
      <span aria-hidden style={{ width: 8, height: 34, borderRadius: 4, background: style.color }} />
      <div className="flex-1">
        <div className="font-semibold">{style.title}</div>
        <div className="ds-caption">
          {alert.merchantName && alert.amountMinor !== null && (
            <>{alert.merchantName} {style.verb} {money(Math.abs(alert.amountMinor))} · </>
          )}
          {shortDate(alert.eventOccurredAt)}
          {late && ' · detected later, while Money was closed'}
        </div>
      </div>
    </>
  );
}

function AlertRow({ alert, onDismissed, onOpen }: AlertRowProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 border-b border-[var(--color-line)] py-2.5 last:border-b-0">
      <AlertText alert={alert} />
      {alert.merchantName && (
        <Button size="sm" onClick={() => onOpen(alert.merchantName as string)}>
          Open
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        onClick={() => void call('alerts:dismiss', { alertId: alert.id }).then(onDismissed)}
      >
        Dismiss
      </Button>
    </div>
  );
}

/** FR-032, FR-033: alert history, and per-rule configuration. */
export function Alerts({ onOpenMerchant }: { onOpenMerchant: (merchantName: string) => void }): React.JSX.Element {
  const alerts = useQuery<AlertView[]>('alerts:list', { limit: 100 });
  const rules = useQuery<AlertRuleView[]>('alertRules:list');
  const [creating, setCreating] = useState(false);
  const open = (alerts.data ?? []).filter((a) => !a.dismissed);

  return (
    <div className="space-y-3.5">
      <PageHeader title="Alerts" sub={open.length > 0 ? `${open.length} new` : ''} />
      <div className="ds-grid" style={{ gridTemplateColumns: '1fr 1.1fr' }}>
        <Card title="Recent">
          {alerts.loading && <p className="text-[var(--color-ink-faint)]">Loading…</p>}
          {alerts.data && open.length === 0 && (
            <EmptyState
              title="Nothing has needed your attention"
              detail="Large purchases, duplicate charges, and new subscriptions show up here as they happen."
            />
          )}
          {open.map((a) => <AlertRow key={a.id} alert={a} onDismissed={alerts.refetch} onOpen={onOpenMerchant} />)}
        </Card>
        <Card
          title="What you get told about"
          actions={
            <Button size="sm" onClick={() => setCreating((open) => !open)}>
              + New alert
            </Button>
          }
        >
          {(rules.data ?? []).map((rule) => (
            <RuleRow key={rule.id} rule={rule} onChanged={rules.refetch} />
          ))}
          {creating && (
            <AddRule
              onCreated={() => {
                rules.refetch();
                setCreating(false);
              }}
            />
          )}
        </Card>
      </div>
    </div>
  );
}
