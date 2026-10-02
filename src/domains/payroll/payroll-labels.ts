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
