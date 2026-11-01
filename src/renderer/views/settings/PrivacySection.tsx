import { Card, Chip } from '../../components/ui';
import type { ChipTone } from '../../components/ui';
import { BackupCard } from './BackupCard';
import { ResetCard } from './ResetCard';

export interface Protection {
  readonly databaseEncrypted: boolean;
  readonly keysInKeychain: boolean;
}

function flag(known: boolean | undefined): { tone: ChipTone; label: string } {
  if (known === undefined) return { tone: 'neutral', label: 'Unknown' };
  return known ? { tone: 'ok', label: 'On' } : { tone: 'bad', label: 'Off' };
}

/** Protection list, backups and reset: what is locked, and how to get out or start over. */
export function PrivacySection({
  protection,
  lastBackupAt,
  onBackedUp,
}: {
  protection: Protection | undefined;
  lastBackupAt: string | null;
  onBackedUp: () => void;
}): React.JSX.Element {
  const rows = [
    { name: 'Database', detail: 'Encrypted on disk (ChaCha20-Poly1305)', ...flag(protection?.databaseEncrypted) },
    { name: 'Database key', detail: 'Stored in macOS Keychain', ...flag(protection?.keysInKeychain) },
    { name: 'Plaid and Claude keys', detail: 'Stored in macOS Keychain', ...flag(protection?.keysInKeychain) },
    { name: 'Usage data', detail: 'Kept on this Mac only, never sent', tone: 'ok' as const, label: 'Local' },
  ];
  return (
    <>
      <Card title="Protection">
        {rows.map((row) => (
          <div key={row.name} className="ds-row border-b border-[var(--color-line)] py-2.5 last:border-b-0">
            <span className="flex-1">
              <span className="font-medium">{row.name}</span>
              <br />
              <span className="ds-caption">{row.detail}</span>
            </span>
            <Chip tone={row.tone}>{row.label}</Chip>
          </div>
        ))}
      </Card>
      <BackupCard lastBackupAt={lastBackupAt} onDone={onBackedUp} />
      <ResetCard />
    </>
  );
}
