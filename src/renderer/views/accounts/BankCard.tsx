import { call } from '../../lib/ipc';
import { money, relativeAge, shortDate } from '../../lib/format';
import { Button, Card, Chip, MerchantMark, Toggle } from '../../components/ui';
import type { ChipTone } from '../../components/ui';
import type { AccountRow, InstitutionSummary } from '@shared/types';

const STATUS_CHIP: Record<InstitutionSummary['status'], { tone: ChipTone; label: string }> = {
  healthy: { tone: 'ok', label: 'Connected' },
  reauth_required: { tone: 'warn', label: 'Action needed' },
  error: { tone: 'bad', label: 'Sync failing' },
};

function syncLine(institution: InstitutionSummary): string {
  if (institution.status === 'healthy') {
    return institution.lastSyncedAt ? `Synced ${relativeAge(institution.lastSyncedAt)}` : 'Not synced yet';
  }
  return institution.lastSyncedAt
    ? `Needs sign-in since ${shortDate(institution.lastSyncedAt)}`
    : 'Needs sign-in';
}

/** One bank: its sync state, each account with balance and the day-to-day switch, and its actions. */
export function BankCard({
  institution,
  onChanged,
  onSignIn,
  signingIn,
}: {
  institution: InstitutionSummary;
  onChanged: () => void;
  onSignIn: () => void;
  signingIn: boolean;
}): React.JSX.Element {
  const chip = STATUS_CHIP[institution.status];
  return (
    <Card>
      <div className="ds-row">
        <MerchantMark name={institution.institutionName} />
        <div className="flex-1">
          <div className="font-semibold">{institution.institutionName}</div>
          <div className="ds-caption">{syncLine(institution)}</div>
        </div>
        <Chip tone={chip.tone}>{chip.label}</Chip>
      </div>
      {institution.accounts.map((account) => (
        <AccountBlock key={account.id} account={account} onChanged={onChanged} />
      ))}
      <div className="ds-row mt-3">
        {institution.status !== 'healthy' && (
          <Button variant="primary" size="sm" disabled={signingIn} onClick={onSignIn}>
            Sign in again
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => void call('institutions:disconnect', { institutionId: institution.id }).then(onChanged)}
        >
          Disconnect
        </Button>
      </div>
    </Card>
  );
}

function AccountBlock({
  account,
  onChanged,
}: {
  account: AccountRow;
  onChanged: () => void;
}): React.JSX.Element {
  return (
    <>
      <div className="ds-row mt-3.5 border-t border-[var(--color-line)] pt-3">
        <div className="min-w-0 flex-1">
          <div className="truncate">
            {account.name}
            {account.mask && <span className="ds-num ds-faint ml-2">••{account.mask}</span>}
          </div>
          <div className="ds-caption">{account.subtype ?? account.type}</div>
        </div>
        {account.currentBalanceMinor === null ? (
          <span className="ds-caption">balance unknown</span>
        ) : (
          <span className="ds-num text-[16px]">{money(account.currentBalanceMinor)}</span>
        )}
      </div>
      <div className="ds-row mt-2 text-[12px]">
        <Toggle
          checked={account.isEveryday}
          label={`Include ${account.name} in day-to-day spending`}
          onChange={(isEveryday) =>
            void call('accounts:setEveryday', { accountId: account.id, isEveryday }).then(onChanged)
          }
        />
        Counts toward day-to-day spending
      </div>
    </>
  );
}
