import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * FR-049: the system MUST NOT initiate, authorize, or modify any movement of
 * money. A negative safety constraint with no test is one that can silently
 * regress when someone enables another Plaid product later.
 */

const MONEY_MOVEMENT_APIS = [
  'transferCreate',
  'transferAuthorizationCreate',
  'paymentInitiationPaymentCreate',
  'paymentInitiationRecipientCreate',
  'transferIntentCreate',
  'bankTransferCreate',
  'transferCapabilitiesGet',
  '/transfer/create',
  '/payment_initiation/',
  '/bank_transfer/',
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe('read-only guarantee (FR-049)', () => {
  const files = sourceFiles(join(process.cwd(), 'src'));

  it('finds source files to scan', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('references no money-movement API anywhere in src/', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      for (const api of MONEY_MOVEMENT_APIS) {
        if (content.includes(api)) offenders.push(`${file}: ${api}`);
      }
    }
    expect(offenders, `money-movement API referenced:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('declares only the transactions product when creating a link token', () => {
    const linkFiles = files.filter((f) => f.includes('plaid'));
    const withProducts = linkFiles
      .map((f) => readFileSync(f, 'utf8'))
      .filter((c) => c.includes('products'));
    for (const content of withProducts) {
      expect(content).not.toMatch(/['"](transfer|payment_initiation|auth)['"]/);
    }
  });
});
