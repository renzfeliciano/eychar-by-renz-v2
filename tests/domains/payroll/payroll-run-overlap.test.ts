import { describe, it, expect, beforeEach } from "vitest";
import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { PayrollRunModel } from "@/server/db/models";
import { assertNoOverlap, runsConflict, type RunKey } from "@/domains/payroll/payroll-run-guards";
import { PAYROLL_RUN_TYPES, runTypeOf } from "@/domains/payroll/payroll-labels";
import { ConflictError } from "@/shared/errors";
import { dateKeyToDate } from "@/lib/date-key";
import { seedPayrollOrganization } from "./fixtures";

const OCT = { start: "2026-10-01", end: "2026-10-15" };
const YEAR = { start: "2026-01-01", end: "2026-12-31" };
const NEXT_YEAR = { start: "2027-01-01", end: "2027-12-31" };

describe("run-type-aware overlap (Gate A matrix)", () => {
  it("reads a run with no type as regular", () => {
    expect(runTypeOf({})).toBe("regular");
    expect(runTypeOf({ runType: null })).toBe("regular");
    expect(runTypeOf({ runType: "final" })).toBe("final");
  });

  // Every pair of different types: never a conflict, even over the same dates and scope, and even for the same employee.
  for (const a of PAYROLL_RUN_TYPES) {
    for (const b of PAYROLL_RUN_TYPES) {
      if (a === b) continue;
      it(`${a} never conflicts with ${b}`, () => {
        expect(runsConflict({ runType: a, employeeId: "e1", ...YEAR }, { runType: b, employeeId: "e1", ...YEAR })).toBe(false);
      });
    }
  }

  for (const type of ["regular", "thirteenth_month", "year_end_adjustment"] as const) {
    const dates = type === "regular" ? OCT : YEAR;
    const later = type === "regular" ? { start: "2026-10-16", end: "2026-10-31" } : NEXT_YEAR;
    it(`${type} conflicts with ${type} over overlapping dates in an overlapping scope only`, () => {
      const org: RunKey = { runType: type, ...dates };
      expect(runsConflict(org, { runType: type, ...dates })).toBe(true);
      expect(runsConflict(org, { runType: type, projectId: "p1", ...dates })).toBe(true);
      expect(runsConflict({ ...org, projectId: "p1" }, { runType: type, projectId: "p1", ...dates })).toBe(true);
      expect(runsConflict({ ...org, projectId: "p1" }, { runType: type, projectId: "p2", ...dates })).toBe(false);
      expect(runsConflict(org, { runType: type, ...later })).toBe(false);
    });
  }

  it("treats a run saved without a type as regular", () => {
    expect(runsConflict({ ...OCT }, { runType: "regular", ...OCT })).toBe(true);
    expect(runsConflict({ ...OCT }, { runType: "thirteenth_month", ...YEAR })).toBe(false);
  });

  it("final conflicts with final for the same employee, whatever the dates, and never for another employee", () => {
    expect(runsConflict({ runType: "final", employeeId: "e1", ...OCT }, { runType: "final", employeeId: "e1", ...NEXT_YEAR })).toBe(true);
    expect(runsConflict({ runType: "final", employeeId: "e1", ...OCT }, { runType: "final", employeeId: "e2", ...OCT })).toBe(false);
  });

  describe("against stored runs", () => {
    beforeEach(async () => {
      await connectMongoDB();
    });

    async function storeRun(organizationId: string, fields: Record<string, unknown>) {
      return PayrollRunModel.create({
        organizationId: new Types.ObjectId(organizationId),
        runNumber: `PR-T-${Math.random()}`,
        payFrequency: "monthly",
        payDate: dateKeyToDate("2026-10-20"),
        policyId: new Types.ObjectId(),
        ruleVersionId: new Types.ObjectId(),
        status: "draft",
        ...fields,
      });
    }

    it("blocks a regular run over an old run saved with no type, but lets other types through", async () => {
      const { organizationId } = await seedPayrollOrganization();
      await storeRun(organizationId, { payPeriodStart: dateKeyToDate(OCT.start), payPeriodEnd: dateKeyToDate(OCT.end) });

      await expect(assertNoOverlap(organizationId, undefined, OCT.start, OCT.end)).rejects.toThrow(ConflictError);
      await expect(assertNoOverlap(organizationId, undefined, YEAR.start, YEAR.end, undefined, { runType: "thirteenth_month" })).resolves.toBeUndefined();
      await expect(assertNoOverlap(organizationId, undefined, OCT.start, OCT.end, undefined, { runType: "final", employeeId: new Types.ObjectId().toString() })).resolves.toBeUndefined();
    });

    it("blocks a second 13th-month run for the same year and a second final run for the same employee; cancelled runs don't count", async () => {
      const { organizationId } = await seedPayrollOrganization();
      const employeeId = new Types.ObjectId();
      await storeRun(organizationId, { runType: "thirteenth_month", payPeriodStart: dateKeyToDate(YEAR.start), payPeriodEnd: dateKeyToDate(YEAR.end) });
      await storeRun(organizationId, { runType: "final", employeeId, payPeriodStart: dateKeyToDate(OCT.start), payPeriodEnd: dateKeyToDate(OCT.end) });
      await storeRun(organizationId, { runType: "year_end_adjustment", status: "cancelled", payPeriodStart: dateKeyToDate(YEAR.start), payPeriodEnd: dateKeyToDate(YEAR.end) });

      await expect(assertNoOverlap(organizationId, undefined, YEAR.start, YEAR.end, undefined, { runType: "thirteenth_month" })).rejects.toThrow(/13th month/);
      await expect(assertNoOverlap(organizationId, undefined, NEXT_YEAR.start, NEXT_YEAR.end, undefined, { runType: "thirteenth_month" })).resolves.toBeUndefined();
      await expect(assertNoOverlap(organizationId, undefined, "2026-11-01", "2026-11-30", undefined, { runType: "final", employeeId: employeeId.toString() })).rejects.toThrow(/final pay/);
      await expect(assertNoOverlap(organizationId, undefined, YEAR.start, YEAR.end, undefined, { runType: "year_end_adjustment" })).resolves.toBeUndefined();
    });
  });
});
