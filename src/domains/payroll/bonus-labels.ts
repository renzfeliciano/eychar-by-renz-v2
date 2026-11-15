import { formatMoney } from "@/lib/money";

type BonusBasisRecord = { basis: string; value: number; monthlyBasic: number; dailyRate: number; prorated?: boolean | null; monthsServed?: number | null; computed: number; overridden?: boolean | null };

/** How a bonus run's amount was worked out, for the register and the payslip: "50% of ₱30,000.00 monthly salary × 6/12 months". */
export function bonusBasisText(record: BonusBasisRecord): string {
  const base =
    record.basis === "percent_of_monthly"
      ? `${record.value}% of ${formatMoney(record.monthlyBasic)} monthly salary`
      : record.basis === "months_of_pay"
        ? `${record.value} month${record.value <= 1 ? "" : "s"} × ${formatMoney(record.monthlyBasic)}`
        : record.basis === "days_of_pay"
          ? `${record.value} day${record.value <= 1 ? "" : "s"} × ${formatMoney(record.dailyRate)}`
          : `Fixed ${formatMoney(record.value)}`;
  const prorated = record.prorated && record.monthsServed != null ? ` × ${record.monthsServed}/12 months` : "";
  const changed = record.overridden ? ` · amount set by HR (worked out ${formatMoney(record.computed)})` : "";
  return `${base}${prorated}${changed}`;
}
