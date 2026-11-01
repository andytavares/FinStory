import { Check } from 'lucide-react';
import { Chip } from '../../components/ui';

const STEPS = ['Choose file', 'Match accounts', 'Check', 'Import'] as const;

/** `step` is the current one (1 to 4); earlier ones are done. Step 5 marks everything done. */
export function StepChips({ step }: { step: number }): React.JSX.Element {
  return (
    <div className="ds-row" style={{ gap: 8 }}>
      {STEPS.map((label, index) => {
        const number = index + 1;
        const done = number < step;
        return (
          <span key={label} className="ds-row" style={{ gap: 8 }}>
            <Chip tone={done ? 'ok' : number === step ? 'accent' : 'neutral'}>
              {done ? <Check size={11} aria-hidden /> : number} {label}
            </Chip>
            {number < STEPS.length && <span className="ds-faint">—</span>}
          </span>
        );
      })}
    </div>
  );
}
