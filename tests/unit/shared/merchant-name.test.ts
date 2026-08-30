import { describe, it, expect } from 'vitest';
import { resolveMerchantName } from '@shared/merchant-name';

const aliases = new Map([['uber eats', 'Uber Eats']]);

describe('resolveMerchantName: the user\'s own name always wins', () => {
  it('prefers a name typed on this transaction over everything', () => {
    expect(
      resolveMerchantName(
        {
          description: 'UBER *EATS 8829',
          merchantName: 'Uber',
          userMerchantName: 'Dinner delivery',
          merchantKey: 'uber eats',
        },
        aliases,
      ),
    ).toBe('Dinner delivery');
  });

  it('falls back to the merchant-wide rename', () => {
    expect(
      resolveMerchantName(
        { description: 'UBER *EATS 8829', merchantName: 'Uber', merchantKey: 'uber eats' },
        aliases,
      ),
    ).toBe('Uber Eats');
  });

  it('falls back to the bank merchant name when the user has renamed nothing', () => {
    expect(
      resolveMerchantName({ description: 'SQ *BLUE BOTTLE', merchantName: 'Blue Bottle' }),
    ).toBe('Blue Bottle');
  });

  it('falls back to the raw descriptor last', () => {
    expect(resolveMerchantName({ description: 'ACH DEBIT 4471' })).toBe('ACH DEBIT 4471');
  });

  it('never shows the normalized merchant key, which is an identifier', () => {
    expect(
      resolveMerchantName({ description: 'UBER *EATS 8829', merchantKey: 'uber eats' }),
    ).toBe('UBER *EATS 8829');
  });

  it('ignores a blank override rather than showing an empty name', () => {
    expect(
      resolveMerchantName({
        description: 'SQ *BLUE BOTTLE',
        merchantName: 'Blue Bottle',
        userMerchantName: '   ',
      }),
    ).toBe('Blue Bottle');
  });

  it('ignores a null override', () => {
    expect(
      resolveMerchantName({
        description: 'SQ *BLUE BOTTLE',
        merchantName: 'Blue Bottle',
        userMerchantName: null,
      }),
    ).toBe('Blue Bottle');
  });

  it('works with no alias map supplied', () => {
    expect(resolveMerchantName({ description: 'X', merchantKey: 'uber eats' })).toBe('X');
  });

  it('trims a stored alias', () => {
    expect(
      resolveMerchantName({ description: 'X', merchantKey: 'k' }, new Map([['k', '  Costco  ']])),
    ).toBe('Costco');
  });
});
