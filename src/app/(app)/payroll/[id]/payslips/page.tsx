import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { PayrollRunService } from "@/domains/payroll/payroll-run-service";
import { ProjectService } from "@/domains/organization/project-service";
import { PAYROLL_RUN_STATUS_LABELS, formatPeso, type PayrollRunStatus } from "@/domains/payroll/payroll-labels";
import { NotFoundError } from "@/shared/errors";
import { dateToDateKey, formatDateKey, formatDateRange } from "@/lib/date-key";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Payslips" };

type Line = { label: string; amount: number };

// Fixed paper colors, not theme tokens: a printed payslip looks the same whatever the screen theme.
function Rows({ title, lines, totalLabel, total }: { title: string; lines: Line[]; totalLabel: string; total: number }) {
  return (
    <div className="flex flex-col">
      <p className="border-b border-[#d4d4d8] pb-1 text-[11px] font-semibold tracking-wide text-[#52525b] uppercase">{title}</p>
      {lines.map((line, index) => (
        <div key={`${line.label}-${index}`} className="flex justify-between gap-3 py-0.5 text-[12px]">
          <span>{line.label}</span>
          <span className="tabular-nums">{formatPeso(line.amount)}</span>
        </div>
      ))}
      <div className="mt-auto flex justify-between gap-3 border-t border-[#d4d4d8] pt-1 text-[12px] font-semibold">
        <span>{totalLabel}</span>
        <span className="tabular-nums">{formatPeso(total)}</span>
      </div>
    </div>
  );
}

export default async function PayslipsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ employee?: string }> }) {
  const [{ id }, { employee }] = await Promise.all([params, searchParams]);
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;
  const organizationId = organization._id.toString();
  if (!(await hasPermission("payroll-runs.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view payslips.</p>;
  }

  let detail;
  try {
    detail = await PayrollRunService.getDetail(id, organizationId);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const { run } = detail;
  const records = employee ? detail.records.filter((record) => record.employeeId.toString() === employee) : detail.records;
  const projects = await ProjectService.listCurrent(organizationId);
  const projectNameById = new Map(projects.map((project) => [project._id.toString(), project.name]));
  const periodLabel = formatDateRange(dateToDateKey(run.payPeriodStart), dateToDateKey(run.payPeriodEnd));
  const payDateLabel = formatDateKey(dateToDateKey(run.payDate));
  const isFinal = run.status === "approved" || run.status === "released";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-col gap-1">
          <Link href={`/payroll/${id}`} className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            {run.runNumber}
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Payslips</h1>
          <p className="text-sm text-muted-foreground">
            {records.length === 1 ? records[0].employeeName : `${records.length} employees`} · {periodLabel}
            {!isFinal && ` · ${PAYROLL_RUN_STATUS_LABELS[run.status as PayrollRunStatus]}, not final yet`}
          </p>
        </div>
        <PrintButton label={records.length === 1 ? "Print payslip" : "Print all"} />
      </div>

      <div className="flex flex-col gap-6 print:gap-0">
        {records.map((record) => {
          const contributionLines = record.contributions.map((line: { name: string; employee: number }) => ({ label: line.name, amount: line.employee }));
          const otherLines = record.deductions.map((line: { label: string; amount: number }) => ({ label: line.label, amount: line.amount }));
          return (
            <article
              key={record._id.toString()}
              className="mx-auto w-full max-w-3xl break-after-page rounded-xl border bg-white p-6 text-[#18181b] shadow-[var(--shadow-soft)] print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none"
            >
              <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-[#18181b] pb-3">
                <div>
                  <p className="text-base font-bold">{organization.name}</p>
                  <p className="text-[12px] text-[#52525b]">Payslip · {run.runNumber}</p>
                </div>
                <div className="text-right text-[12px]">
                  <p>
                    <span className="text-[#52525b]">Period </span>
                    {periodLabel}
                  </p>
                  <p>
                    <span className="text-[#52525b]">Pay date </span>
                    {payDateLabel}
                  </p>
                  {!isFinal && <p className="font-semibold text-[#b45309]">Draft: not final</p>}
                </div>
              </header>

              <section className="grid grid-cols-2 gap-x-6 gap-y-1 py-3 text-[12px] sm:grid-cols-4">
                <div>
                  <p className="text-[#52525b]">Employee</p>
                  <p className="font-semibold">{record.employeeName}</p>
                </div>
                <div>
                  <p className="text-[#52525b]">Employee #</p>
                  <p>{record.employeeNumber}</p>
                </div>
                <div>
                  <p className="text-[#52525b]">Project</p>
                  <p>{record.projectId ? (projectNameById.get(record.projectId.toString()) ?? "—") : "—"}</p>
                </div>
                <div>
                  <p className="text-[#52525b]">Rate</p>
                  <p>
                    {formatPeso(record.rate)} {record.rateType === "daily" ? "a day" : "a month"}
                  </p>
                </div>
              </section>

              <section className="grid gap-6 border-t border-[#e4e4e7] pt-3 sm:grid-cols-2 print:grid-cols-2">
                <Rows title="Earnings" lines={record.earnings.map((line: { label: string; amount: number }) => ({ label: line.label, amount: line.amount }))} totalLabel="Gross pay" total={record.grossPay} />
                <Rows
                  title="Deductions"
                  lines={[...contributionLines, { label: "Withholding tax", amount: record.tax }, ...otherLines]}
                  totalLabel="Total deductions"
                  total={record.totalDeductions}
                />
              </section>

              <section className="mt-4 flex items-center justify-between rounded-md bg-[#f4f4f5] px-4 py-3">
                <span className="text-[13px] font-semibold">Net pay</span>
                <span className="text-xl font-bold tabular-nums">{formatPeso(record.netPay)}</span>
              </section>

              <footer className="mt-4 grid gap-6 text-[11px] text-[#52525b] sm:grid-cols-2 print:grid-cols-2">
                <div className="flex flex-col gap-0.5">
                  <p>
                    Days worked {record.attendance?.daysWorked ?? 0} · absent {record.attendance?.absentDays ?? 0} · paid leave {record.attendance?.paidLeaveDays ?? 0} · late/undertime{" "}
                    {(record.attendance?.lateMinutes ?? 0) + (record.attendance?.undertimeMinutes ?? 0)} min
                  </p>
                  <p>Employer contributions {formatPeso(record.employerContributions)} (not deducted from pay).</p>
                  <p>System-generated payslip. Keep it for your records.</p>
                </div>
                <div className="flex flex-col justify-end gap-1">
                  <div className="h-8 border-b border-[#a1a1aa]" />
                  <p>Received by (signature over printed name) and date</p>
                </div>
              </footer>
            </article>
          );
        })}
        {records.length === 0 && <p className="text-sm text-muted-foreground">No payslips in this run.</p>}
      </div>
    </div>
  );
}
