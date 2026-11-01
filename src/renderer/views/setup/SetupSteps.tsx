export const STEP_TITLES = [
  'Connect your bank',
  'Choose how to sort transactions',
  'Bring in history (optional)',
  'Done',
] as const;

/** The left panel: brand, headline and the four steps with done / now / todo states. */
export function SetupSteps({
  step,
  onSelect,
}: {
  step: number;
  onSelect: (index: number) => void;
}): React.JSX.Element {
  return (
    <aside
      className="flex flex-col gap-[18px] border-r border-[var(--color-line)] px-8 py-[34px]"
      style={{ background: 'linear-gradient(160deg, #16204a 0%, var(--color-side) 55%)' }}
    >
      <div className="ds-brand" style={{ padding: '6px 0 0', fontSize: 16 }}>
        <b>$</b>Money
      </div>
      <h1 className="mt-6 text-[28px] font-semibold leading-[1.15] tracking-[-0.03em]">
        Set up once.
        <br />
        Never type a transaction again.
      </h1>
      <p className="ds-muted m-0 text-[13.5px]">
        Money reads your accounts, sorts every charge, and tells you what changed. Everything stays
        on this Mac, encrypted.
      </p>
      <ol className="m-0 mt-auto flex list-none flex-col p-0">
        {STEP_TITLES.map((title, index) => {
          const state = index < step ? 'done' : index === step ? 'now' : 'todo';
          return (
            <li key={title} className="border-t border-[var(--color-line)] py-3 first:border-t-0">
              <button
                type="button"
                onClick={() => onSelect(index)}
                aria-current={state === 'now' ? 'step' : undefined}
                className="ds-row cursor-pointer border-0 bg-transparent p-0 text-left"
                style={{ color: state === 'todo' ? 'var(--color-ink-faint)' : 'var(--color-ink)' }}
              >
                <span
                  className="grid h-[22px] w-[22px] place-items-center rounded-full text-[11px] font-semibold"
                  style={{
                    background:
                      state === 'done'
                        ? 'var(--color-positive)'
                        : state === 'now'
                          ? 'var(--color-accent)'
                          : 'var(--color-panel-2)',
                    color: state === 'todo' ? 'var(--color-ink-faint)' : 'var(--color-accent-ink)',
                  }}
                >
                  {state === 'done' ? '✓' : index + 1}
                </span>
                {title}
              </button>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
