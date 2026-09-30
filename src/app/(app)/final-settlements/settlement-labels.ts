export const SETTLEMENT_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  submitted: "Awaiting review",
  reviewed: "Awaiting approval",
  approved: "Approved, to pay",
  disbursed: "Paid",
  cancelled: "Cancelled",
};

export const SETTLEMENT_STATUS_TONES: Record<string, "warning" | "success" | "info" | "neutral"> = {
  draft: "neutral",
  submitted: "info",
  reviewed: "info",
  approved: "warning",
  disbursed: "success",
  cancelled: "neutral",
};

export const PESO = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

const DAY_MS = 86_400_000;

/** The deadline length a settlement was computed with (from its payroll policy). */
export function deadlineDaysOf(settlement: { inputs?: unknown }): number | null {
  const days = (settlement.inputs as { finalPayDeadlineDays?: number } | undefined)?.finalPayDeadlineDays;
  return typeof days === "number" ? days : null;
}

/** Days left until the final pay deadline (negative once overdue). The deadline length comes from the payroll policy, recorded on the settlement. */
export function daysToDeadline(lastWorkingDay: Date | string, now: Date, deadlineDays: number): number {
  const deadline = new Date(lastWorkingDay).getTime() + deadlineDays * DAY_MS;
  return Math.ceil((deadline - now.getTime()) / DAY_MS);
}
