import { resolveMerchantName, type NameableTransaction } from '@shared/merchant-name';

/** Shapes a stored report for the detail screen with the names the user sees elsewhere. */

interface Purchase {
  readonly id: string;
  readonly categoryName: string;
}

interface RecurringLine {
  readonly merchantKey: string;
}

interface StoredReport {
  readonly largestPurchases?: Purchase[];
  readonly recurringAudit?: RecurringLine[];
}

export interface DetailLookups {
  readonly transactions: ReadonlyMap<string, NameableTransaction & { postedDate: string }>;
  readonly aliases: ReadonlyMap<string, string>;
  readonly merchantNames: ReadonlyMap<string, string>;
}

export function presentReportContent<T extends StoredReport>(content: T, lookups: DetailLookups): T {
  return {
    ...content,
    ...(content.largestPurchases && {
      largestPurchases: content.largestPurchases.map((purchase) => {
        const tx = lookups.transactions.get(purchase.id);
        return {
          ...purchase,
          merchantName: tx ? resolveMerchantName(tx, lookups.aliases) : purchase.categoryName,
          postedDate: tx?.postedDate ?? null,
        };
      }),
    }),
    ...(content.recurringAudit && {
      recurringAudit: content.recurringAudit.map((line) => ({
        ...line,
        merchantName: lookups.merchantNames.get(line.merchantKey) ?? line.merchantKey,
      })),
    }),
  };
}

interface KpiSource {
  readonly type: string;
  readonly periodStart: string;
  readonly content: string;
}

const KPI_PERIODS = 5;

/** In, out, saved and savings rate for the periods up to and including `current`. */
export function kpiSeries(reports: readonly KpiSource[], current: KpiSource): unknown[] {
  if (current.type !== 'monthly_report') return [];
  return reports
    .filter((r) => r.type === current.type && r.periodStart <= current.periodStart)
    .sort((a, b) => a.periodStart.localeCompare(b.periodStart))
    .slice(-KPI_PERIODS)
    .map((r) => {
      const c = JSON.parse(r.content) as Record<string, number | undefined>;
      return {
        periodStart: r.periodStart,
        totalIncomeMinor: c['totalIncomeMinor'] ?? 0,
        totalSpendingMinor: c['totalSpendingMinor'] ?? 0,
        savingsMinor: c['savingsMinor'] ?? 0,
        savingsRate: c['savingsRate'] ?? 0,
      };
    });
}

/** Default file name offered when saving a report as PDF. */
export function reportPdfName(report: { type: string; periodStart: string; periodEnd: string }): string {
  const start = report.periodStart.slice(0, 10);
  const period = report.type === 'monthly_report' ? start.slice(0, 7) : `${start} to ${report.periodEnd.slice(0, 10)}`;
  return `Money report ${period}.pdf`;
}
