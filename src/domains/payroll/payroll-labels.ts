/** Display names shared by the payroll screens, exports and payslips. */
export const PAYROLL_RUN_STATUS_LABELS = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  released: "Released",
  cancelled: "Cancelled",
} as const;

export type PayrollRunStatus = keyof typeof PAYROLL_RUN_STATUS_LABELS;

/** The main path a run takes; cancelled sits outside it. */
export const PAYROLL_RUN_STEPS: PayrollRunStatus[] = ["draft", "submitted", "approved", "released"];

/** Kinds of payroll run (payroll plan Phase 2). Runs saved before run types existed have none and are regular. */
export const PAYROLL_RUN_TYPE_LABELS = {
  regular: "Regular",
  thirteenth_month: "13th month",
  year_end_adjustment: "Year-end tax adjustment",
  final: "Final pay",
} as const;

export type PayrollRunType = keyof typeof PAYROLL_RUN_TYPE_LABELS;
export const PAYROLL_RUN_TYPES = Object.keys(PAYROLL_RUN_TYPE_LABELS) as PayrollRunType[];

/** "PR-2026-0001", or "PR-2026-0001 · 13th month" for any run that isn't regular. */
export function runTitle(run: { runNumber: string; runType?: string | null }): string {
  const type = runTypeOf(run);
  return type === "regular" ? run.runNumber : `${run.runNumber} · ${PAYROLL_RUN_TYPE_LABELS[type]}`;
}

/** A run's type, reading a run saved before run types existed as regular. */
export function runTypeOf(run: { runType?: string | null }): PayrollRunType {
  return (run.runType ?? "regular") as PayrollRunType;
}

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Kept for existing imports: the one money formatter is `formatMoney` in `@/lib/money`. */
export { formatMoney as formatPeso } from "@/lib/money";

/** "Every 10th and 25th", "Every month on the 31st", "Weekly, ending Saturday". */
export function describeCutoffs(payFrequency: string, cutoffDay: number): string {
  const ordinal = (day: number) => {
    const suffix = day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
    return `${day}${suffix}`;
  };
  if (payFrequency === "weekly") return `Weekly, ending ${WEEKDAY_NAMES[cutoffDay] ?? "?"}`;
  if (payFrequency === "monthly") return cutoffDay >= 28 ? "Monthly, ending on the last day" : `Monthly, ending on the ${ordinal(cutoffDay)}`;
  return cutoffDay >= 15 ? "Cutoffs end on the 15th and the last day" : `Cutoffs end on the ${ordinal(cutoffDay)} and ${ordinal(cutoffDay + 15)}`;
}
