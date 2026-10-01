import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CopyPlus } from "lucide-react";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { PayrollRuleVersionService } from "@/domains/payroll/payroll-rule-version-service";
import { PAY_FREQUENCY_LABELS, type PayFrequency } from "@/domains/payroll/engine/pay-frequency";
import { formatPeso } from "@/domains/payroll/payroll-labels";
import { NotFoundError } from "@/shared/errors";
import { dateToDateKey, formatDateKey } from "@/lib/date-key";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Rule version" };

type Bracket = { minIncome: number; maxIncome?: number | null; rate: number; baseDeduction: number };
type Row = { from: number; to?: number | null; employeeRate?: number | null; employerRate?: number | null; employeeAmount?: number | null; employerAmount?: number | null; extraAmount?: number | null };
type Contribution = { code: string; name: string; floor?: number | null; ceiling?: number | null; extraLabel?: string | null; rows: Row[] };

const percent = (value: number) => `${Number((value * 100).toPrecision(10))}%`;
const share = (rate?: number | null, amount?: number | null) => (amount != null ? formatPeso(amount) : rate != null ? percent(rate) : "—");

export default async function RuleVersionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;
  const organizationId = organization._id.toString();
  if (!(await hasPermission("payroll-rule-versions.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view payroll rule versions.</p>;
  }

  let version;
  try {
    version = await PayrollRuleVersionService.getById(id, organizationId);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const canCreate = await hasPermission("payroll-rule-versions.create", organizationId);
  const taxTables = version.taxTables as { payFrequency: PayFrequency; brackets: Bracket[] }[];
  const contributions = version.contributions as Contribution[];

  return (
    <div className="flex flex-col gap-6">
      <Link href="/payroll/rule-versions" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Rule versions
      </Link>
      <PageHeader
        title={`v${version.versionNumber} · ${version.name}`}
        description={`${version.description ? `${version.description} ` : ""}Effective from ${formatDateKey(dateToDateKey(version.effectiveFrom))}.`}
        action={
          <div className="flex items-center gap-2">
            <StatusBadge status={version.status} />
            {canCreate && (
              <Link href={`/payroll/rule-versions/new?from=${id}`} className={cn(buttonVariants({ size: "sm" }))}>
                <CopyPlus className="size-3.5" />
                New version from this
              </Link>
            )}
          </div>
        }
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Withholding tax</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          {taxTables.map((table) => (
            <div key={table.payFrequency} className="overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-soft)]">
              <p className="border-b bg-muted/40 px-3 py-2 text-sm font-medium">{PAY_FREQUENCY_LABELS[table.payFrequency]}</p>
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="px-3 py-1.5 text-left font-medium">Taxable pay</th>
                    <th className="px-3 py-1.5 text-right font-medium">Tax</th>
                  </tr>
                </thead>
                <tbody>
                  {table.brackets.map((bracket, index) => (
                    <tr key={index} className="border-t">
                      <td className="px-3 py-1.5 tabular-nums">
                        {formatPeso(bracket.minIncome)} {bracket.maxIncome != null ? `– ${formatPeso(bracket.maxIncome)}` : "and over"}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {bracket.rate === 0 && bracket.baseDeduction === 0 ? "None" : `${bracket.baseDeduction ? `${formatPeso(bracket.baseDeduction)} + ` : ""}${percent(bracket.rate)} over ${formatPeso(bracket.minIncome)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Government contributions</h2>
        <p className="-mt-2 text-sm text-muted-foreground">Monthly amounts on monthly basic pay; the payroll policy decides whether they&apos;re split across cutoffs.</p>
        {contributions.map((rule) => (
          <details key={rule.code} className="rounded-xl border bg-card shadow-[var(--shadow-soft)]" open={rule.rows.length <= 3}>
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3">
              <span className="font-medium">{rule.name}</span>
              <span className="text-xs text-muted-foreground">
                {rule.rows.length} {rule.rows.length === 1 ? "row" : "rows"}
                {rule.floor != null ? ` · floor ${formatPeso(rule.floor)}` : ""}
                {rule.ceiling != null ? ` · ceiling ${formatPeso(rule.ceiling)}` : ""}
              </span>
            </summary>
            <div className="max-h-96 overflow-auto border-t">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted text-muted-foreground">
                  <tr>
                    <th className="px-3 py-1.5 text-left font-medium">Monthly pay</th>
                    <th className="px-3 py-1.5 text-right font-medium">Employee</th>
                    <th className="px-3 py-1.5 text-right font-medium">Employer</th>
                    {rule.extraLabel && <th className="px-3 py-1.5 text-right font-medium">{rule.extraLabel}</th>}
                  </tr>
                </thead>
                <tbody>
                  {rule.rows.map((row, index) => (
                    <tr key={index} className="border-t">
                      <td className="px-3 py-1.5 tabular-nums">
                        {formatPeso(row.from)} {row.to != null ? `– ${formatPeso(row.to)}` : "and over"}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{share(row.employeeRate, row.employeeAmount)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{share(row.employerRate, row.employerAmount)}</td>
                      {rule.extraLabel && <td className="px-3 py-1.5 text-right tabular-nums">{row.extraAmount != null ? formatPeso(row.extraAmount) : "—"}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ))}
        {contributions.length === 0 && <p className="text-sm text-muted-foreground">No contributions in this version.</p>}
      </section>
    </div>
  );
}
