export type ChipTone = 'neutral' | 'accent' | 'ok' | 'bad' | 'warn';

const TONE_CLASS: Record<ChipTone, string> = {
  neutral: '',
  accent: 'ds-chip-accent',
  ok: 'ds-chip-ok',
  bad: 'ds-chip-bad',
  warn: 'ds-chip-warn',
};

export interface ChipProps extends React.AriaAttributes {
  readonly tone?: ChipTone;
  /** CSS colour for a leading dot, e.g. `categoryColor(2)`. */
  readonly dot?: string;
  /** `sm` is 18px high, for chips that sit inside a table row. */
  readonly size?: 'md' | 'sm';
  /** Makes the chip a button. */
  readonly onClick?: () => void;
  readonly role?: string;
  readonly title?: string;
  readonly children: React.ReactNode;
}

export function Chip({
  tone = 'neutral',
  dot,
  size = 'md',
  onClick,
  children,
  ...aria
}: ChipProps): React.JSX.Element {
  const className = ['ds-chip', TONE_CLASS[tone], size === 'sm' ? 'ds-chip-sm' : ''].filter(Boolean).join(' ');
  const content = (
    <>
      {dot && <i aria-hidden style={{ background: dot }} />}
      {children}
    </>
  );
  return onClick ? (
    <button type="button" className={className} onClick={onClick} {...aria}>
      {content}
    </button>
  ) : (
    <span className={className} {...aria}>
      {content}
    </span>
  );
}
