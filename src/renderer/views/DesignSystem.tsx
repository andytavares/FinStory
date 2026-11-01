import { useState } from 'react';
import {
  Button,
  Card,
  Chip,
  Drawer,
  Eyebrow,
  Field,
  ListRow,
  ListRows,
  Menu,
  MenuItem,
  MerchantMark,
  NavList,
  PageHeader,
  ProgressBar,
  Segmented,
  Select,
  Stat,
  Table,
  TextInput,
  Toggle,
} from '../components/ui';
import { categoryColor } from '../lib/categoryColor';
import { CategoryBars } from '../charts/CategoryBars';
import { CategoryDonut } from '../charts/CategoryDonut';
import { IncomeVsSpending } from '../charts/IncomeVsSpending';
import { RunwayChart } from '../charts/RunwayChart';
import { Sparkline } from '../charts/Sparkline';
import { SpendingOverTime } from '../charts/SpendingOverTime';
import { SyncHistory } from '../charts/SyncHistory';

const SPEND = [189_000, 187_400, 224_400, 260_300, 443_000, 1_500];
const MONTHS = ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'];
const CATEGORIES = [
  { name: 'Housing', value: 180_000 },
  { name: 'Food', value: 61_240 },
  { name: 'Subscriptions', value: 2_698 },
  { name: 'Transport', value: 11_820 },
  { name: 'Shopping', value: 45_000 },
];

function ButtonsSection(): React.JSX.Element {
  return (
    <>
      <Card title="Buttons and chips" caption="Button, Chip">
        <div className="ds-row" style={{ flexWrap: 'wrap' }}>
          <Button>Default</Button>
          <Button variant="primary">Primary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button size="sm">Small</Button>
          <Chip>Neutral</Chip>
          <Chip tone="accent">Your rule</Chip>
          <Chip tone="ok">Connected</Chip>
          <Chip tone="bad">Failed</Chip>
          <Chip tone="warn">Check</Chip>
          <Chip dot={categoryColor(1)}>Food</Chip>
        </div>
      </Card>
    </>
  );
}

function StatsSection(): React.JSX.Element {
  return (
    <>
      <div className="ds-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <Stat label="Spent this month" value="$15.00" delta="99% below Oct pace" tone="pos" series={[1890, 1874, 2244, 2603, 4430, 15]} />
        <Stat label="Income this month" value="$0.00" delta="Next: $3,100 on Nov 12" series={[3100, 6200, 6200, 6200, 6200, 0]} color="var(--color-positive)" />
        <Stat label="Recurring / month" value="$1,826.98" delta="3 to confirm" series={[1810, 1815, 1826, 1826]} color="var(--color-cat-6)" />
        <Stat label="Safe to spend / day" value="$37.80" delta="Keeps you above $1,000" tone="pos" series={[60, 52, 48, 41, 39, 37.8]} color="var(--color-attention)" />
      </div>
    </>
  );
}

function RunwaySection(): React.JSX.Element {
  return (
    <>
      <div className="ds-grid" style={{ gridTemplateColumns: '1.25fr 1fr' }}>
        <Card title="Runway to payday" caption="RunwayChart">
          <RunwayChart
            points={[
              { date: '2026-11-01', balance: 236_700 },
              { date: '2026-11-05', balance: 190_000 },
              { date: '2026-11-09', balance: 150_000 },
              { date: '2026-11-12', balance: 141_600 },
            ]}
            floor={100_000}
            label="$1,416 on payday"
          />
        </Card>
        <Card title="Where it went" caption="CategoryDonut">
          <CategoryDonut parts={CATEGORIES} legend />
        </Card>
      </div>
    </>
  );
}

function MenuSection(): React.JSX.Element {
  const [section, setSection] = useState('general');
  const [needsReview, setNeedsReview] = useState(false);
  return (
    <>
      <Card title="Menu, NavList, ListRows, Card tones" caption="Menu, MenuItem, NavList, ListRows, Card">
        <div className="ds-row" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <Menu trigger="Account: All">
            {(close) => (
              <>
                <MenuItem onClick={close}>All</MenuItem>
                <MenuItem onClick={close}>Gold Card</MenuItem>
              </>
            )}
          </Menu>
          <Chip role="switch" aria-checked={needsReview} tone={needsReview ? 'accent' : 'neutral'} onClick={() => setNeedsReview(!needsReview)}>
            Needs review · 8
          </Chip>
          <Chip size="sm">Small chip</Chip>
          <MerchantMark name="Quicken" color="var(--color-cat-7)" />
          <NavList
            label="Example sections"
            items={[{ id: 'general', label: 'General' }, { id: 'updates', label: 'Updates' }]}
            active={section}
            onSelect={setSection}
          />
          <Card selected className="w-48">Selected Card</Card>
          <Card tone="danger" className="w-48">Danger Card</Card>
          <div className="w-64">
            <ListRows>
              <ListRow><span className="flex-1">Transactions</span><span className="ds-num">56</span></ListRow>
              <ListRow><span className="flex-1">Accounts</span><span className="ds-num">3</span></ListRow>
            </ListRows>
          </div>
        </div>
      </Card>
    </>
  );
}

function OverTimeSection(): React.JSX.Element {
  return (
    <>
      <div className="ds-grid" style={{ gridTemplateColumns: '1.25fr 1fr' }}>
        <Card>
          <SpendingOverTime
            title="Spending by month"
            data={MONTHS.map((label, i) => ({ label, spendingMinor: SPEND[i] ?? 0 }))}
            priorAverageMinor={280_000}
            showShapeToggle={false}
          />
        </Card>
        <Card title="Deposits vs spending" caption="IncomeVsSpending">
          <IncomeVsSpending
            data={MONTHS.map((label, i) => ({ label, income: i < 5 ? 620_000 : 0, spending: SPEND[i] ?? 0 }))}
          />
        </Card>
      </div>
    </>
  );
}

function BarsSection(): React.JSX.Element {
  return (
    <>
      <div className="ds-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <Card>
          <CategoryBars
            title="Spending by category"
            data={CATEGORIES.map((c) => ({ categoryId: c.name, categoryName: c.name, totalMinor: -c.value }))}
          />
        </Card>
        <Card title="Sync history" caption="SyncHistory, Sparkline, ProgressBar">
          <SyncHistory runs={[8, 9, 7, 9, 10, 8, 9, 0, 9, 8, 10, 9, 8, 9].map((value) => ({ ok: value > 0, value }))} />
          <div className="ds-row" style={{ marginTop: 14 }}>
            <Sparkline values={[3, 5, 4, 8, 6, 9]} color="#6d8bff" width={180} height={40} />
          </div>
          <div style={{ marginTop: 14 }}>
            <ProgressBar value={0.62} color={categoryColor(1)} label="Food budget" />
          </div>
        </Card>
      </div>
    </>
  );
}

function TableSection(): React.JSX.Element {
  const [range, setRange] = useState('month');
  const [hidden, setHidden] = useState(false);
  return (
    <>
      <div className="ds-grid" style={{ gridTemplateColumns: '1fr 330px' }}>
        <Card title="Table, MerchantMark, Segmented" actions={<Segmented label="Range" value={range} onChange={setRange} options={[{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }]} />}>
          <Table>
            <thead>
              <tr><th>Merchant</th><th>Category</th><th className="r">Amount</th></tr>
            </thead>
            <tbody>
              {['Whole Foods', 'Landlord', 'Uber Eats'].map((name, i) => (
                <tr key={name} aria-selected={i === 2}>
                  <td><span className="ds-row"><MerchantMark name={name} />{name}</span></td>
                  <td><Chip dot={categoryColor(name)}>Category</Chip></td>
                  <td className="r ds-num">−$18.71</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Drawer title="Drawer" caption="Field, TextInput, Select, Toggle">
          <Eyebrow>Eyebrow</Eyebrow>
          <Field label="Name"><TextInput defaultValue="Uber Eats" /></Field>
          <Field label="Category">
            <Select defaultValue="dining"><option value="dining">Dining & Takeout</option></Select>
          </Field>
          <div className="ds-row" style={{ fontSize: 12 }}>
            <Toggle checked={hidden} onChange={setHidden} label="Leave out of spending totals" />
            Leave out of spending totals
          </div>
        </Drawer>
      </div>
    </>
  );
}

/** Dev-only gallery: every design-system piece with example data. */
export function DesignSystem(): React.JSX.Element {
  return (
    <>
      <PageHeader
        title="Design system"
        sub="Every shared component, with example data"
        actions={<Button variant="primary">Primary action</Button>}
      />
      <ButtonsSection />
      <StatsSection />
      <RunwaySection />
      <MenuSection />
      <OverTimeSection />
      <BarsSection />
      <TableSection />
    </>
  );
}
