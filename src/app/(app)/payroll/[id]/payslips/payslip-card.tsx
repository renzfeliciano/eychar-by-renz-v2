import { formatPeso } from "@/domains/payroll/payroll-labels";
import { formatDateKey } from "@/lib/date-key";

/** `nonTaxable` marks an earning that isn't taxed (allowances, 13th month, refunds…; payroll plan Phase 7). */
type Line = { label: string; amount: number; nonTaxable?: boolean };

// Fixed paper colors, not theme tokens: a printed payslip looks the same whatever the screen theme.
function Rows({ title, lines, totalLabel, total }: { title: string; lines: Line[]; totalLabel: string; total: number }) {
  return (
    <div className="flex flex-col">
      <p className="border-b border-[#d4d4d8] pb-1 text-[11px] font-semibold tracking-wide text-[#52525b] uppercase">{title}</p>
      {lines.map((line, index) => (
        <div key={`${line.label}-${index}`} className="flex justify-between gap-3 py-0.5 text-[12px]">
          <span>
            {line.label}
            {line.nonTaxable && <span className="ml-1.5 text-[10px] text-[#71717a]">non-taxable</span>}
          </span>
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

/** What one payslip shows: the stored record's figures and snapshots (plain, so the card renders anywhere). */
export type PayslipRecord = {
  _id: { toString(): string } | string;
  employeeName: string;
  employeeNumber: string;
  rate: number;
  rateType: string;
  earnings: { label: string; amount: number; taxable?: boolean }[];
  contributions: { name: string; employee: number }[];
  deductions: { label: string; amount: number }[];
  grossPay: number;
  taxableIncome: number;
  tax: number;
  totalDeductions: number;
  netPay: number;
  employerContributions: number;
  attendance?: { daysWorked?: number | null; absentDays?: number | null; paidLeaveDays?: number | null; lateMinutes?: number | null; undertimeMinutes?: number | null } | null;
  thirteenthMonth?: { basicEarned: number; estimatedBasic?: number | null; divisor: number; alreadyPaid?: number | null } | null;
  yearEnd?: { year: number; grossTaxable: number; taxDue: number; withheld: number; difference: number } | null;
  finalSettlement?: { version: number; hash: string; lastWorkingDay: string } | null;
};

/**
 * One printable payslip (payroll plan Phase 7: every line with its taxable flag, and what a 13th-month,
 * year-end or final run's figure came from).
 */
export function PayslipCard({
  record,
  organizationName,
  runLabel,
  periodLabel,
  payDateLabel,
  isFinal,
  projectName,
}: {
  record: PayslipRecord;
  organizationName: string;
  runLabel: string;
  periodLabel: string;
  payDateLabel: string;
  isFinal: boolean;
  projectName: string | null;
}) {
  const contributionLines = record.contributions.map((line) => ({ label: line.name, amount: line.employee }));
  const otherLines = record.deductions.map((line) => ({ label: line.label, amount: line.amount }));
  return (
    <article
            className="mx-auto w-full max-w-3xl break-after-page rounded-lg border bg-white p-6 text-[#18181b] shadow-[var(--shadow-soft)] print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none"
    >
      <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-[#18181b] pb-3">
        <div>
          <p className="text-base font-bold">{organizationName}</p>
          <p className="text-[12px] text-[#52525b]">Payslip · {runLabel}</p>
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
          <p>{projectName ?? "—"}</p>
        </div>
        <div>
          <p className="text-[#52525b]">Rate</p>
          <p>
            {formatPeso(record.rate)} {record.rateType === "daily" ? "a day" : "a month"}
          </p>
        </div>
      </section>

      <section className="grid gap-6 border-t border-[#e4e4e7] pt-3 sm:grid-cols-2 print:grid-cols-2">
        <Rows
          title="Earnings"
          lines={record.earnings.map((line: { label: string; amount: number; taxable?: boolean }) => ({ label: line.label, amount: line.amount, nonTaxable: line.taxable === false }))}
          totalLabel="Gross pay"
          total={record.grossPay}
        />
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
            {record.yearEnd ? (
              <>
                Year-end {record.yearEnd.year}: taxable {formatPeso(record.yearEnd.grossTaxable)} · tax due {formatPeso(record.yearEnd.taxDue)} · withheld{" "}
                {formatPeso(record.yearEnd.withheld)} ·{" "}
                {record.yearEnd.difference > 0 ? `to collect ${formatPeso(record.yearEnd.difference)}` : record.yearEnd.difference < 0 ? `refund ${formatPeso(-record.yearEnd.difference)}` : "no difference"}
              </>
            ) : record.finalSettlement ? (
              <>
                Final pay · last working day {formatDateKey(record.finalSettlement.lastWorkingDay)} · settlement version {record.finalSettlement.version} · fingerprint{" "}
                {String(record.finalSettlement.hash).slice(0, 10)}
              </>
            ) : record.thirteenthMonth ? (
              <>
                Basic earned {formatPeso(record.thirteenthMonth.basicEarned)}
                {record.thirteenthMonth.estimatedBasic ? ` + ${formatPeso(record.thirteenthMonth.estimatedBasic)} estimated` : ""} ÷ {record.thirteenthMonth.divisor}
                {record.thirteenthMonth.alreadyPaid ? ` − ${formatPeso(record.thirteenthMonth.alreadyPaid)} already paid` : ""}
              </>
            ) : (
              <>
            Days worked {record.attendance?.daysWorked ?? 0} · absent {record.attendance?.absentDays ?? 0} · paid leave {record.attendance?.paidLeaveDays ?? 0} · late/undertime{" "}
            {(record.attendance?.lateMinutes ?? 0) + (record.attendance?.undertimeMinutes ?? 0)} min
              </>
            )}
          </p>
          <p>Taxable income {formatPeso(record.taxableIncome)} (taxable earnings less contributions).</p>
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
}
