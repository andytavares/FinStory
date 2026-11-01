import { useState } from 'react';
import { call } from '../../lib/ipc';
import { Button, TextInput, Toggle } from '../../components/ui';
import { RULE_TYPES, type AlertRuleView } from './rules';

/** One rule as a sentence, its value input, and an on/off switch. */
export function RuleRow({
  rule,
  onChanged,
}: {
  rule: AlertRuleView;
  onChanged: () => void;
}): React.JSX.Element {
  const [threshold, setThreshold] = useState(
    rule.thresholdMinor === null ? '' : String(rule.thresholdMinor / 100),
  );
  const [windowMinutes, setWindowMinutes] = useState(
    rule.windowMinutes === null ? '' : String(rule.windowMinutes),
  );
  const [label, setLabel] = useState(rule.label ?? '');
  const [enabled, setEnabled] = useState(rule.enabled);
  const spec = RULE_TYPES.find((r) => r.id === rule.type);
  const save = (patch: Record<string, unknown>): void => {
    void call('alertRules:update', { id: rule.id, ...patch });
  };

  return (
    <div className="flex items-center gap-3 border-b border-[var(--color-line)] py-2.5 last:border-b-0">
      <TextInput
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => save({ label: label.trim() || null })}
        placeholder={spec?.label ?? rule.type}
        aria-label={`Name for ${spec?.label ?? rule.type}`}
        className="flex-1 !border-transparent !bg-transparent !px-0 hover:!border-[var(--color-line)]"
      />
      {spec?.needs === 'threshold' && (
        <TextInput
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          onBlur={() => save({ thresholdMinor: threshold ? Math.round(Number(threshold) * 100) : null })}
          inputMode="decimal"
          aria-label={`Threshold for ${spec.label}`}
          className="ds-num"
          style={{ width: 86, height: 26 }}
        />
      )}
      {spec?.needs === 'window' && (
        <TextInput
          value={windowMinutes}
          onChange={(e) => setWindowMinutes(e.target.value)}
          onBlur={() => save({ windowMinutes: windowMinutes ? Number(windowMinutes) : null })}
          inputMode="numeric"
          aria-label={`Window for ${spec.label}`}
          className="ds-num"
          style={{ width: 86, height: 26 }}
        />
      )}
      <Toggle
        checked={enabled}
        label={`${spec?.label ?? rule.type} on`}
        onChange={(next) => {
          setEnabled(next);
          save({ enabled: next });
        }}
      />
      {!rule.isSystem && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void call('alertRules:delete', { id: rule.id }).then(onChanged)}
        >
          Delete
        </Button>
      )}
    </div>
  );
}
