import { Card, ProgressBar } from '../../components/ui';
import type { UsageSummary } from './types';

const BAR_FILL =
  'linear-gradient(90deg, color-mix(in srgb, var(--color-accent) 70%, var(--color-ground)), var(--color-accent))';

export function FeatureBars({ summary }: { summary: UsageSummary }): React.JSX.Element {
  const max = Math.max(1, ...summary.byFeature.map((f) => f.count));
  return (
    <section>
      <Card title="Most and least used">
        <ul className="m-0 mt-2.5 flex max-h-[360px] list-none flex-col gap-[7px] overflow-y-auto p-0">
          {summary.byFeature.map((f) => (
            <li key={f.id} className="ds-row">
              <span className={`w-[170px] text-[12px] ${f.count === 0 ? 'ds-faint' : ''}`}>{f.label}</span>
              <div className="flex-1">
                <ProgressBar value={f.count / max} color={BAR_FILL} label={`${f.label} uses`} />
              </div>
              <span className={`ds-num w-8 text-right text-[12px] ${f.count === 0 ? 'ds-warn' : 'ds-muted'}`}>
                {f.count}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
