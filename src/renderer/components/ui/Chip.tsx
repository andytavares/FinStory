export type ChipTone = 'neutral' | 'accent' | 'ok' | 'bad' | 'warn';

const TONE_CLASS: Record<ChipTone, string> = {
  neutral: '',
  accent: 'ds-chip-accent',
  ok: 'ds-chip-ok',
  bad: 'ds-chip-bad',
  warn: 'ds-chip-warn',
};

export function Chip({
  tone = 'neutral',
  dot,
  children,
}: {
  tone?: ChipTone;
  /** CSS colour for a leading dot, e.g. `categoryColor(2)`. */
  dot?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <span className={`ds-chip ${TONE_CLASS[tone]}`.trim()}>
      {dot && <i aria-hidden style={{ background: dot }} />}
      {children}
    </span>
  );
}
