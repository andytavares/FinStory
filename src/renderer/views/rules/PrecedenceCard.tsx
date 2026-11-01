import { Card, Chip } from '../../components/ui';

const STEPS = ['One-off', 'Rule', 'History', 'Model', 'Bank'] as const;
/** The first two steps are the user's own choices. */
const OWN_CHOICES = 2;

export function PrecedenceCard(): React.JSX.Element {
  return (
    <Card className="flex items-center gap-4">
      <div className="flex-1">
        <div className="font-semibold">How Money decides a name and category</div>
        <div className="ds-faint text-[12px]">
          One-off change on that charge › your merchant rule › your past corrections › model ›
          imported value. A one-off change never edits the rule.
        </div>
      </div>
      <div className="ds-row" style={{ gap: 6 }}>
        {STEPS.map((step, index) => (
          <span key={step} className="ds-row" style={{ gap: 6 }}>
            <Chip tone={index < OWN_CHOICES ? 'accent' : 'neutral'}>{step}</Chip>
            {index < STEPS.length - 1 && <span className="ds-faint">›</span>}
          </span>
        ))}
      </div>
    </Card>
  );
}
