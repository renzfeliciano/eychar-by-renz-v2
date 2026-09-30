import { describe, it, expect } from "vitest";
import { caseProgress, deriveCaseStatus, isItemOverdue, isItemResolved, summarizeClearances, type ClearanceItemLike } from "@/domains/clearance/clearance-summary";

const item = (overrides: Partial<ClearanceItemLike>): ClearanceItemLike => ({
  departmentCode: "it",
  departmentName: "IT",
  blocking: true,
  status: "pending",
  dueDate: new Date("2026-10-10T00:00:00.000Z"),
  amount: null,
  ...overrides,
});

describe("clearance item rules", () => {
  it("treats cleared, flagged (with an accountability), waived and not-applicable items as resolved", () => {
    expect(isItemResolved(item({ status: "pending" }))).toBe(false);
    for (const status of ["cleared", "flagged", "waived", "not_applicable"] as const) expect(isItemResolved(item({ status }))).toBe(true);
  });

  it("marks an unresolved item overdue only after its due date", () => {
    const now = new Date("2026-10-11T08:00:00.000Z");
    expect(isItemOverdue(item({}), now)).toBe(true);
    expect(isItemOverdue(item({ status: "cleared" }), now)).toBe(false);
    expect(isItemOverdue(item({}), new Date("2026-10-10T08:00:00.000Z"))).toBe(false);
  });

  it("is cleared once every blocking item is resolved, even with non-blocking items still open", () => {
    expect(deriveCaseStatus([item({ status: "cleared" }), item({ blocking: false })])).toBe("cleared");
    expect(deriveCaseStatus([item({ status: "cleared" }), item({})])).toBe("in_clearance");
  });
});

describe("caseProgress", () => {
  it("counts resolved items per department in checklist order, and totals flagged amounts", () => {
    const progress = caseProgress(
      [
        item({ departmentCode: "hr", departmentName: "HR", status: "cleared" }),
        item({ departmentCode: "it", departmentName: "IT", status: "flagged", amount: 8500 }),
        item({ departmentCode: "it", departmentName: "IT" }),
      ],
      new Date("2026-10-01T00:00:00.000Z"),
    );

    expect(progress.resolved).toBe(2);
    expect(progress.total).toBe(3);
    expect(progress.flaggedAmount).toBe(8500);
    expect(progress.departments).toEqual([
      { code: "hr", name: "HR", resolved: 1, total: 1, overdue: 0 },
      { code: "it", name: "IT", resolved: 1, total: 2, overdue: 0 },
    ]);
  });
});

describe("summarizeClearances", () => {
  it("counts cases in clearance, overdue items, last days this week, and cases ready for final pay", () => {
    const now = new Date("2026-10-11T00:00:00.000Z");
    const summary = summarizeClearances(
      [
        { status: "in_clearance", lastWorkingDay: new Date("2026-10-14T00:00:00.000Z"), items: [item({})] },
        { status: "cleared", lastWorkingDay: new Date("2026-10-01T00:00:00.000Z"), items: [item({ status: "cleared" })] },
        { status: "cancelled", lastWorkingDay: new Date("2026-10-12T00:00:00.000Z"), items: [item({})] },
      ],
      now,
    );

    expect(summary).toEqual({ inClearance: 1, overdueItems: 1, lastDayThisWeek: 1, readyForFinalPay: 1 });
  });
});
