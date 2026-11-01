import { useState } from 'react';
import { call } from '../../lib/ipc';
import { Button, Chip, TextInput } from '../../components/ui';
import { Money } from '../../components/Money';
import { money } from '../../lib/format';
import { ChargeCard } from './ChargeCard';
import { cadenceSince } from './cadence';
import { latestRise, priceHistory } from './priceHistory';
import type { RecurringChargeView } from '@shared/types';

function monthOf(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
}

interface RenameInputProps {
  readonly charge: RecurringChargeView;
  readonly rename: { onDone: () => void; onChanged: () => void };
}

function RenameInput({ charge, rename }: RenameInputProps): React.JSX.Element {
  const { onDone, onChanged } = rename;
  const [name, setName] = useState(charge.merchantName);
  const submit = (): void => {
    const next = name.trim();
    onDone();
    if (!next || next === charge.merchantName) return;
    // Applies to every transaction from this merchant, matching the register.
    void call('merchants:rename', { merchantKey: charge.merchantKey, displayName: next }).then(
      onChanged,
    );
  };
  return (
    <TextInput
      autoFocus
      value={name}
      onChange={(e) => setName(e.target.value)}
      onBlur={submit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') submit();
        if (e.key === 'Escape') {
          setName(charge.merchantName);
          onDone();
        }
      }}
      aria-label={`Rename ${charge.merchantName}`}
      className="w-full"
    />
  );
}

function ConfirmedFooter({ charge }: { charge: RecurringChargeView }): React.JSX.Element {
  const rise = latestRise(charge.amountChanges);
  return (
    <>
      <span className="ds-caption">
        <Money minor={charge.cumulativePaidMinor} magnitude /> paid
      </span>
      {rise && (
        <span className="ml-auto">
          <Chip tone="warn">
            ↑ Was {money(Math.abs(rise.oldAmountMinor))} until {monthOf(rise.changedAt)}
          </Chip>
        </span>
      )}
    </>
  );
}

interface ConfirmedCardProps {
  readonly charge: RecurringChargeView;
  readonly actions: { onChanged: () => void; onOpenMerchant: (merchantKey: string) => void };
}

/** A confirmed or stopped recurring charge. */
export function ConfirmedCard({ charge, actions }: ConfirmedCardProps): React.JSX.Element {
  const { onChanged, onOpenMerchant } = actions;
  const [renaming, setRenaming] = useState(false);
  const markNotRecurring = (): void =>
    void call('recurring:markNotRecurring', { id: charge.id }).then(onChanged);

  return (
    <ChargeCard
      summary={{
        markName: charge.merchantName,
        name: renaming ? (
          <RenameInput charge={charge} rename={{ onDone: () => setRenaming(false), onChanged }} />
        ) : (
          charge.merchantName
        ),
        subtitle: cadenceSince(charge.cadence, charge.firstSeenDate),
        amountMinor: charge.currentAmountMinor,
        history: priceHistory(charge.amountChanges, charge.currentAmountMinor),
      }}
      footer={<ConfirmedFooter charge={charge} />}
    >
      <Button size="sm" onClick={() => onOpenMerchant(charge.merchantKey)}>
        See charges
      </Button>
      <Button size="sm" onClick={() => setRenaming(true)}>
        Rename
      </Button>
      {charge.status === 'active' ? (
        <Button size="sm" variant="ghost" className="ml-auto" onClick={markNotRecurring}>
          Not recurring
        </Button>
      ) : (
        <span className="ds-caption ml-auto">Marked not recurring</span>
      )}
    </ChargeCard>
  );
}
