import { useState } from 'react';
import { call } from '../../lib/ipc';
import { Button, Chip, TextInput } from '../../components/ui';
import { Money } from '../../components/Money';
import { money } from '../../lib/format';
import { ChargeCard } from './ChargeCard';
import { cadenceSince } from './cadence';
import { latestRise, priceHistory } from './priceHistory';
import type { ScheduledCharge } from './types';

function monthOf(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
}

function RenameInput({
  charge,
  onDone,
  onChanged,
}: {
  charge: ScheduledCharge;
  onDone: () => void;
  onChanged: () => void;
}): React.JSX.Element {
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

/** A confirmed or stopped recurring charge. */
export function ConfirmedCard({
  charge,
  onChanged,
  onOpenMerchant,
}: {
  charge: ScheduledCharge;
  onChanged: () => void;
  onOpenMerchant: (merchantKey: string) => void;
}): React.JSX.Element {
  const [renaming, setRenaming] = useState(false);
  const rise = latestRise(charge.amountChanges);
  const markNotRecurring = (): void =>
    void call('recurring:markNotRecurring', { id: charge.id }).then(onChanged);

  return (
    <ChargeCard
      markName={charge.merchantName}
      name={
        renaming ? (
          <RenameInput charge={charge} onDone={() => setRenaming(false)} onChanged={onChanged} />
        ) : (
          charge.merchantName
        )
      }
      subtitle={cadenceSince(charge.cadence, charge.firstSeenDate)}
      amountMinor={charge.currentAmountMinor}
      history={priceHistory(charge.amountChanges, charge.currentAmountMinor)}
      footer={
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
      }
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
