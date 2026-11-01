import { useEffect, useState } from 'react';
import { call } from '../lib/ipc';

export function UpdateToast(): React.JSX.Element | null {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(
    () =>
      window.money.on('update:ready', (payload) =>
        setVersion((payload as { version: string }).version),
      ),
    [],
  );

  if (!version) return null;
  return (
    <div
      role="status"
      className="fixed right-[18px] bottom-[18px] z-50 w-[300px] rounded-xl border border-[rgba(150,168,214,.22)] bg-[#182036] px-[14px] py-3 shadow-[0_20px_50px_rgba(0,0,0,.5)]"
    >
      <div className="flex items-center gap-2 text-[13px] font-bold">
        <span className="h-[7px] w-[7px] rounded-full bg-[#6d8bff]" />
        Money {version} is ready
      </div>
      <p className="mt-1 text-[12px] text-[var(--color-ink-faint)]">
        Downloaded in the background. Restart to finish updating.
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <button className="btn" onClick={() => setVersion(null)}>
          Later
        </button>
        <button
          className="btn !border-[#6d8bff] !bg-[#6d8bff] !text-[#0a0d14]"
          onClick={() => void call('update:install')}
        >
          Restart now
        </button>
      </div>
    </div>
  );
}
