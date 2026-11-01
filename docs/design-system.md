# Design system

Dark only. Values come from the approved design (mock.css, mock.js). Tokens live in the `@theme` block of `src/renderer/styles.css`. Component styles live in `src/renderer/design-system.css`. React components live in `src/renderer/components/ui/` (import from `components/ui`). Charts live in `src/renderer/charts/`. Open the live gallery in dev: sidebar, Dev, "Design system" (`src/renderer/views/DesignSystem.tsx`).

## Rules

- Never hand-roll a button, card, chip, field or toggle. Add a variant to the component instead.
- Never write a colour literal in a view. Use a token. Chart colours come from `charts/theme.ts`.
- Show money in `ds-num` (Geist Mono, tabular figures) or the `.numeric` class.
- Pick category colours with `categoryColor(indexOrId)`. Do not pick them by hand.
- `.btn` is the base class of `Button`. Old markup that uses `className="btn"` still looks right. Move it to `<Button>` when you touch it.

## Tokens

| Token | Value | Use |
|---|---|---|
| `--color-ground` | `#0a0d14` | Page background (under the radial glow), input background |
| `--color-side` | `#0e1220` | Sidebar |
| `--color-surface` | `#121828` | Card, search box |
| `--color-surface-raised`, `--color-panel-2` | `#182036` | Button, chip, selected segment |
| `--color-line` | `rgba(150,168,214,.13)` | Borders, dividers |
| `--color-line-strong` | `rgba(150,168,214,.22)` | Button and input borders |
| `--color-ink` | `#eef1f8` | Main text |
| `--color-ink-muted` | `#aab3c9` | Secondary text |
| `--color-ink-faint` | `#6f7a96` | Captions, eyebrows, axis text |
| `--color-accent` | `#6d8bff` | Primary action, active badge, toggle on |
| `--color-accent-ink` | `#0a0d14` | Text on accent |
| `--color-accent-glow` | `rgba(109,139,255,.18)` | Active nav item, accent chip |
| `--color-positive` | `#3ddc97` | Money in, healthy |
| `--color-negative` | `#ff7a85` | Money out of bounds, failures, danger |
| `--color-attention` | `#ffc457` | Warnings, average line |
| `--color-cat-1` to `--color-cat-8` | `#6d8bff #3ddc97 #ffb547 #f472b6 #38d0f0 #b18cff #ff8f5a #8d98b3` | Category colours |
| `--radius-card` | `12px` | Card |
| `--radius-control` | `7px` | Button, input, nav item |
| `--font-body` | Geist Variable | All text |
| `--font-numeric` | Geist Mono Variable | Figures |

Sizes: base font 13px, sidebar 216px, top bar 46px, body padding 20px 22px, grid gap 14px, button 28px (small 24px), chip 20px, input 30px.

## Components

All are exported from `src/renderer/components/ui/index.ts`.

| Component | Props | Example |
|---|---|---|
| `Button` | `variant` default, primary, ghost, danger; `size` md, sm; all button props; `type="button"` by default | `<Button variant="primary" onClick={save}>Save</Button>` |
| `Card` | `title`, `caption`, `actions`; `tone` default, danger (red border); `selected` (accent ring and glow); all div props | `<Card title="Coming up" caption="Next 30 days">...</Card>` |
| `Drawer` | Same as `Card`. A grid-column panel, not a modal | `<Drawer title="Uber Eats">...</Drawer>` |
| `Eyebrow` | `children` | `<Eyebrow>Next deposit</Eyebrow>` |
| `Chip` | `tone` neutral, accent, ok, bad, warn; `dot` CSS colour; `size` md, sm (18px); `onClick` makes it a button; `role`, `title` and `aria-*` pass through | `<Chip tone="warn">Check</Chip>`, `<Chip role="switch" aria-checked={on} onClick={toggle}>Needs review</Chip>` |
| `Segmented` | `options [{value,label}]`, `value`, `onChange`, `label`. Buttons with `aria-pressed` | `<Segmented value={shape} onChange={setShape} options={[...]} />` |
| `Toggle` | `checked`, `onChange(next)`, `label`. `role="switch"` | `<Toggle checked={hidden} onChange={setHidden} label="Leave out of totals" />` |
| `Field`, `TextInput`, `Select` | `Field label` wraps the control | `<Field label="Name"><TextInput value={name} onChange={...} /></Field>` |
| `Stat` | `label`, `value`, `delta`, `tone` pos, neg, warn, faint; `series`, `color` | `<Stat label="Spent this month" value="$15.00" delta="99% below Oct" tone="pos" series={[...]} />` |
| `MerchantMark` | `name`; `color` overrides the colour, which is otherwise stable per name | `<MerchantMark name="Whole Foods" />` |
| `Menu`, `MenuItem` | `Menu`: `trigger`, `label` (accessible name), `kind` chip or button, `align` left or right, `onClose`, `children(close)`. Closes on outside click and Escape. `MenuItem` is a `role="menuitem"` ghost button | `<Menu trigger="Account: All">{(close) => <MenuItem onClick={close}>Gold Card</MenuItem>}</Menu>` |
| `NavList` | `items [{id,label}]`, `active`, `onSelect(id)`, `label`. Vertical nav-styled buttons, `aria-current` on the active one | `<NavList label="Settings sections" items={items} active={id} onSelect={jump} />` |
| `ListRows`, `ListRow` | Rows with 10px padding and line separators, inside a `Card` | `<ListRows><ListRow>...</ListRow></ListRows>` |
| `PageHeader` | `title`, `sub`, `actions` | `<PageHeader title="Transactions" sub="56 this period" actions={<Button>Export CSV</Button>} />` |
| `ProgressBar` | `value` 0 to 1, `color`, `label` | `<ProgressBar value={0.4} color={categoryColor(1)} label="Food" />` |
| `Table` | Table props. Use `th`/`td`, `.r` for right-aligned, `aria-selected` on `tr` for the selected row | `<Table><thead>...</thead></Table>` |

Helper: `categoryColor(indexOrId)` in `src/renderer/lib/categoryColor.ts` returns `var(--color-cat-N)`.

Shell: `AppShell`, `Sidebar` and `TopBar` in `src/renderer/components/AppShell.tsx`. Add a nav item in `NAV_GROUPS` in `App.tsx`. The top-bar search sends `Route.search` to the Transactions view. Cmd+K focuses it.

## Chart kit

All charts use recharts and share `src/renderer/charts/theme.ts` (grid, axis text, tooltip, gradients, average and floor styles). Amounts are integer minor units.

| Chart | Props |
|---|---|
| `Sparkline` | `values`, `color`, `width`, `height` |
| `CategoryDonut` | `parts [{name,value}]`, `legend`, `size` |
| `RunwayChart` | `points [{date,balance}]`, `floor`, `label` |
| `SpendingOverTime` | `data`, `priorAverageMinor`, `title`, `onSelectPeriod`, `showShapeToggle` (default true). Bars/Line toggle built in |
| `IncomeVsSpending` | `data [{label,income,spending}]` |
| `SyncHistory` | `runs [{ok,value}]`. Green bars scale to the largest `value`; `0` for every run gives equal bars |
| `CategoryBars` | `data`, `title`, `max`, `onSelect` |

Add a chart colour or gradient to `theme.ts`, not to the chart file.
