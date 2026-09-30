export type ClearanceItemStatus = "pending" | "cleared" | "flagged" | "waived" | "not_applicable";
export type ClearanceCaseStatus = "in_clearance" | "cleared" | "cancelled" | "closed";

export type ClearanceItemLike = {
  departmentCode: string;
  departmentName: string;
  blocking: boolean;
  status: string;
  dueDate?: Date | null;
  amount?: number | null;
};

const DAY_MS = 86_400_000;

/** Resolved = nothing more to do on it. Flagged counts: the issue is recorded, with its amount going to final settlement. */
export function isItemResolved(item: Pick<ClearanceItemLike, "status">): boolean {
  return item.status !== "pending";
}

/** Past its due date and still pending. Due dates are calendar days (UTC midnight), so the whole due day counts. */
export function isItemOverdue(item: Pick<ClearanceItemLike, "status" | "dueDate">, now: Date): boolean {
  if (isItemResolved(item) || !item.dueDate) return false;
  return now.getTime() >= new Date(item.dueDate).getTime() + DAY_MS;
}

/** A case is cleared once every blocking item is resolved; non-blocking ones can still be open. */
export function deriveCaseStatus(items: Pick<ClearanceItemLike, "blocking" | "status">[]): "in_clearance" | "cleared" {
  return items.every((item) => !item.blocking || isItemResolved(item)) ? "cleared" : "in_clearance";
}

export type DepartmentProgress = { code: string; name: string; resolved: number; total: number; overdue: number };

/** Per-department progress in checklist order, plus overall counts and what's been flagged as owed. */
export function caseProgress(items: ClearanceItemLike[], now: Date) {
  const departments = new Map<string, DepartmentProgress>();
  let resolved = 0;
  let overdue = 0;
  let flaggedAmount = 0;
  for (const item of items) {
    const department = departments.get(item.departmentCode) ?? { code: item.departmentCode, name: item.departmentName, resolved: 0, total: 0, overdue: 0 };
    department.total += 1;
    if (isItemResolved(item)) {
      department.resolved += 1;
      resolved += 1;
    }
    if (isItemOverdue(item, now)) {
      department.overdue += 1;
      overdue += 1;
    }
    if (item.status === "flagged" && item.amount) flaggedAmount += item.amount;
    departments.set(item.departmentCode, department);
  }
  const blockingOpen = items.filter((item) => item.blocking && !isItemResolved(item)).length;
  return { resolved, total: items.length, overdue, blockingOpen, flaggedAmount, departments: [...departments.values()] };
}

/** The list page's metric strip. */
export function summarizeClearances(cases: { status: string; lastWorkingDay: Date; items: ClearanceItemLike[] }[], now: Date) {
  const weekEnd = now.getTime() + 7 * DAY_MS;
  const active = cases.filter((clearance) => clearance.status === "in_clearance" || clearance.status === "cleared");
  return {
    inClearance: cases.filter((clearance) => clearance.status === "in_clearance").length,
    overdueItems: active.reduce((count, clearance) => count + clearance.items.filter((item) => isItemOverdue(item, now)).length, 0),
    lastDayThisWeek: active.filter((clearance) => {
      const lastDay = new Date(clearance.lastWorkingDay).getTime();
      return lastDay >= now.getTime() - DAY_MS && lastDay <= weekEnd;
    }).length,
    readyForFinalPay: cases.filter((clearance) => clearance.status === "cleared").length,
  };
}
