import { Card } from './Card';
import { Eyebrow } from './Eyebrow';
import { Sparkline } from '../../charts/Sparkline';

export type StatTone = 'pos' | 'neg' | 'warn' | 'faint';

export function Stat({
  label,
  value,
  delta,
  tone = 'faint',
  series,
  color = 'var(--color-accent)',
}: {
  label: string;
  value: string;
  delta?: string;
  tone?: StatTone;
  series?: readonly number[];
  color?: string;
}): React.JSX.Element {
  return (
    <Card>
      <Eyebrow>{label}</Eyebrow>
      <div className="ds-stat-value ds-num">{value}</div>
      <div className="ds-row justify-between !items-end">
        <div className={`ds-stat-delta ds-${tone}`}>{delta}</div>
        {series && <Sparkline values={series} color={color} width={110} height={28} />}
      </div>
    </Card>
  );
}
