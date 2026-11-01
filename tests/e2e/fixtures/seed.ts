import type { ElectronApplication, Page } from '@playwright/test';
import { realpathSync } from 'node:fs';
import { keychainService } from '../../../src/main/secrets/secret-store';

type Row = Record<string, string | number | null>;
interface Seed {
  readonly services: string[];
  readonly tables: Array<[table: string, rows: Row[]]>;
}
interface MoneyWindow {
  money: { invoke(channel: string, payload?: unknown): Promise<unknown> };
}

const EVERYDAY: ReadonlyArray<readonly [string, string]> = [
  ['Whole Foods', 'groceries'],
  ['Uber Eats', 'dining'],
  ['Target', 'groceries'],
  ['Shell', 'fuel'],
  ['Blue Bottle', 'coffee'],
];

/** Example data for e2e tests and user-guide screenshots. All figures are made up. */
export async function seedExampleData(
  app: ElectronApplication,
  page: Page,
  userDataDir: string,
): Promise<void> {
  const services = [...new Set([userDataDir, realpathSync(userDataDir)])].map((path) =>
    keychainService(false, path),
  );
  await app.evaluate(insertRows, { services, tables: exampleTables(new Date()) });
  await page.evaluate(() => (window as unknown as MoneyWindow).money.invoke('analysis:refresh'));
  await page.reload();
  await page.locator('nav').waitFor();
}

// Runs inside the app: only it can read the database key from the Keychain without a prompt.
async function insertRows({ app }: typeof import('electron'), seed: Seed): Promise<void> {
  const load = process
    .getBuiltinModule('node:module')
    .createRequire(`${process.cwd()}/package.json`);
  const { Entry } = load('@napi-rs/keyring');
  const Database = load('better-sqlite3');
  const key = seed.services.map((s) => new Entry(s, 'database-key').getPassword()).find(Boolean);
  const db = new Database(`${app.getPath('userData')}/money.sqlite`);
  db.pragma(`key='${key}'`);
  for (const [table, rows] of seed.tables) {
    for (const row of rows) {
      const columns = Object.keys(row);
      db.prepare(
        `insert into ${table} (${columns.join(',')}) values (${columns.map(() => '?').join(',')})`,
      ).run(...Object.values(row));
    }
  }
  db.close();
}

function exampleTables(today: Date): Seed['tables'] {
  const now = today.toISOString();
  const transactions: Row[] = [];
  const categorizations: Row[] = [];
  const add = (spec: Charge): void => {
    const [transaction, categorization] = chargeRows(spec, transactions.length + 1, today);
    transactions.push(transaction);
    categorizations.push(categorization);
  };
  for (let month = 0; month < 6; month++) {
    add({ daysAgo: 5 + month * 30, amountMinor: -1599, name: 'Netflix', categoryId: 'streaming' });
    add({
      daysAgo: 12 + month * 30,
      amountMinor: -1099,
      name: 'Spotify',
      categoryId: 'streaming',
      accountId: 'a2',
    });
    add({ daysAgo: 1 + month * 30, amountMinor: -180000, name: 'Landlord', categoryId: 'rent' });
  }
  for (let i = 0; i < 12; i++)
    add({ daysAgo: 3 + i * 14, amountMinor: 310000, name: 'Acme Payroll', categoryId: 'income' });
  for (let i = 0; i < 25; i++) add(everydayCharge(i));
  add({
    daysAgo: 2,
    amountMinor: -45000,
    name: 'Apple Store',
    categoryId: 'electronics',
    review: true,
    accountId: 'a2',
  });
  return [
    ['institutions', institutions(now)],
    ['accounts', accounts(now)],
    ['transactions', transactions],
    ['categorizations', categorizations],
  ];
}

interface Charge {
  readonly daysAgo: number;
  readonly amountMinor: number;
  readonly name: string;
  readonly categoryId: string;
  readonly review?: boolean;
  readonly accountId?: string;
}

function everydayCharge(i: number): Charge {
  const [name, categoryId] = EVERYDAY[i % EVERYDAY.length]!;
  const accountId = i % 2 ? 'a2' : 'a1';
  return {
    daysAgo: i * 3,
    amountMinor: -(1500 + i * 371),
    name,
    categoryId,
    review: i % 4 === 0,
    accountId,
  };
}

function chargeRows(charge: Charge, n: number, today: Date): [Row, Row] {
  const date = new Date(today.getTime() - charge.daysAgo * 864e5).toISOString().slice(0, 10);
  const id = `t${n}`;
  const now = today.toISOString();
  const transaction: Row = {
    id,
    account_id: charge.accountId ?? 'a1',
    plaid_transaction_id: `p${id}`,
    amount_minor: charge.amountMinor,
    merchant_name: charge.name,
    merchant_key: charge.name.toLowerCase().replace(/\s+/g, '-'),
    description: charge.name.toUpperCase(),
    posted_date: date,
    datetime: `${date}T14:00:00Z`,
    pending: 0,
    settlement_state: 'posted',
    is_internal_transfer: 0,
    first_seen_at: now,
    updated_at: now,
  };
  const categorization: Row = {
    id: `c${id}`,
    transaction_id: id,
    category_id: charge.categoryId,
    confidence: charge.review ? 0.5 : 0.95,
    source: 'model',
    is_confirmed: 0,
    needs_review: charge.review ? 1 : 0,
    created_at: now,
    reasoning: charge.review ? 'Could be either; the amount is unusual for this merchant.' : null,
  };
  return [transaction, categorization];
}

function institutions(now: string): Row[] {
  const base = {
    access_token_encrypted: '',
    sync_cursor: 'c',
    last_synced_at: now,
    last_attempted_sync_at: now,
    created_at: now,
  };
  return [
    { ...base, id: 'i1', plaid_item_id: 'item1', institution_name: 'Chase', status: 'healthy' },
    {
      ...base,
      id: 'i2',
      plaid_item_id: 'item2',
      institution_name: 'Amex',
      status: 'reauth_required',
    },
  ];
}

function accounts(now: string): Row[] {
  const base = { balance_as_of: now, is_everyday: 1 };
  return [
    {
      ...base,
      id: 'a1',
      institution_id: 'i1',
      plaid_account_id: 'pa1',
      name: 'Everyday Checking',
      mask: '4321',
      type: 'depository',
      subtype: 'checking',
      current_balance_minor: 284700,
    },
    {
      ...base,
      id: 'a2',
      institution_id: 'i2',
      plaid_account_id: 'pa2',
      name: 'Gold Card',
      mask: '1005',
      type: 'credit',
      subtype: 'credit card',
      current_balance_minor: -48000,
    },
  ];
}
