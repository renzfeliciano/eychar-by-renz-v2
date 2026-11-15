import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { PayrollRecordModel, PayrollRunModel, RoleAssignmentModel, RoleModel, UserModel } from "@/server/db/models";
import { PayrollRunService } from "@/domains/payroll/payroll-run-service";
import { PayrollRuleVersionService } from "@/domains/payroll/payroll-rule-version-service";
import { PH_STATUTORY_2025 } from "@/domains/payroll/templates/ph-statutory-2025";
import { PH_YEAR_END_2023 } from "@/domains/payroll/templates/ph-year-end-2023";
import { dateKeysBetween, weekdayOf } from "@/lib/date-key";
import { markAttendance, seedEmployee, seedPayrollOrganization } from "./fixtures";

// Payroll plan Phase 8: the history (§59), reproducibility (§46) and authorization (§60) checks across the run
// types the plan added. Concurrency is covered by tests/security/races-2026-10.test.ts (replica set, C7).

const session = vi.fn();
vi.mock("next-auth", () => ({ getServerSession: () => session() }));
const regularRoute = await import("@/app/api/payroll-runs/route");
const thirteenthRoute = await import("@/app/api/payroll-runs/thirteenth-month/route");
const yearEndRoute = await import("@/app/api/payroll-runs/year-end/route");

const HR = { userId: new Types.ObjectId().toString() };
const OCTOBER = { payPeriodStart: "2026-10-01", payPeriodEnd: "2026-10-15", payDate: "2026-10-20" };
const WORKDAYS = dateKeysBetween("2026-10-01", "2026-10-15").filter((date) => ![0, 6].includes(weekdayOf(date)));

/** The figures a payslip is made of, without ids and timestamps, so two computations compare directly. */
async function figures(runId: unknown) {
  const records = await PayrollRecordModel.find({ payrollRunId: runId }).sort({ employeeNumber: 1 }).lean();
  const skip = new Set(["_id", "createdAt", "updatedAt", "__v"]);
  return records.map((record) => JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(record).filter(([key]) => !skip.has(key))))));
}

async function release(runId: string, organizationId: string) {
  const run = await PayrollRunModel.findById(runId).lean();
  const exclusionReasons = (run?.exclusions ?? []).map((exclusion: { employeeId: Types.ObjectId }) => ({ employeeId: exclusion.employeeId.toString(), reason: "Test" }));
  await PayrollRunService.act(runId, { organizationId, action: "submit", exclusionReasons }, HR);
  await PayrollRunService.act(runId, { organizationId, action: "approve" }, HR);
  return PayrollRunService.act(runId, { organizationId, action: "release", releasedOn: run!.payDate.toISOString().slice(0, 10) }, HR);
}

async function seedCrew() {
  const org = await seedPayrollOrganization();
  const ana = await seedEmployee(org.organizationId, "Ana", { compensation: { rateType: "monthly", rate: 30000 } });
  const ben = await seedEmployee(org.organizationId, "Ben", { compensation: { rateType: "daily", rate: 700 } });
  for (const employeeId of [ana, ben]) for (const day of WORKDAYS) await markAttendance(org.organizationId, employeeId, day, "present");
  return { ...org, ana, ben };
}

describe("history (§59): a past period keeps the rules in force on its dates", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("a rule version that starts later changes neither a recompute nor a fresh run of the earlier period", async () => {
    const { organizationId } = await seedCrew();
    const first = await PayrollRunService.prepare({ organizationId, ...OCTOBER }, HR);
    const before = await figures(first._id);

    // PhilHealth doubles from November: a new version, never an edit of the old one.
    const doubled = PH_STATUTORY_2025.contributions.map((rule) => (rule.code === "PHIC" ? { ...rule, rows: [{ from: 0, employeeRate: 0.05, employerRate: 0.05 }] } : rule));
    await PayrollRuleVersionService.create({ organizationId, ...PH_STATUTORY_2025, contributions: doubled, name: "PH (Nov)", effectiveFrom: "2026-11-01" }, HR);

    await PayrollRunService.act(first._id.toString(), { organizationId, action: "recompute" }, HR);
    expect(await figures(first._id)).toEqual(before);

    await PayrollRunService.act(first._id.toString(), { organizationId, action: "cancel", reason: "Redo" }, HR);
    const again = await PayrollRunService.prepare({ organizationId, ...OCTOBER }, HR);
    const withoutRun = (records: Record<string, unknown>[]) => records.map((record) => ({ ...record, payrollRunId: undefined }));
    expect(withoutRun(await figures(again._id))).toEqual(withoutRun(before));

    // The next period does use the new version.
    const november = await PayrollRunService.prepare({ organizationId, payPeriodStart: "2026-11-01", payPeriodEnd: "2026-11-15", payDate: "2026-11-20" }, HR);
    const anaNov = (await figures(november._id)).find((record) => record.employeeName.startsWith("Ana"))!;
    const anaOct = before.find((record) => record.employeeName.startsWith("Ana"))!;
    const phic = (record: { contributions: { code: string; employee: number }[] }) => record.contributions.find((line) => line.code === "PHIC")!.employee;
    expect(phic(anaNov)).toBeCloseTo(phic(anaOct) * 2, 2);
  });
});

describe("reproducibility (§46): computing a run again gives the same payslips, for each run type", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("regular, 13th month and year-end runs recompute to identical records", async () => {
    const { organizationId } = await seedCrew();
    const october = await PayrollRunService.prepare({ organizationId, ...OCTOBER }, HR);
    const regular = await figures(october._id);
    await PayrollRunService.act(october._id.toString(), { organizationId, action: "recompute" }, HR);
    expect(await figures(october._id)).toEqual(regular);
    await release(october._id.toString(), organizationId);

    const thirteenth = await PayrollRunService.prepareThirteenthMonth({ organizationId, year: 2026, payDate: "2026-12-20" }, HR);
    const thirteenthFigures = await figures(thirteenth._id);
    expect(thirteenthFigures.length).toBeGreaterThan(0);
    await PayrollRunService.act(thirteenth._id.toString(), { organizationId, action: "recompute" }, HR);
    expect(await figures(thirteenth._id)).toEqual(thirteenthFigures);
    await PayrollRunService.act(thirteenth._id.toString(), { organizationId, action: "cancel", reason: "Not needed for this test" }, HR);

    await PayrollRuleVersionService.create({ organizationId, ...PH_STATUTORY_2025, ...PH_YEAR_END_2023, name: "PH with year-end", effectiveFrom: "2026-12-01" }, HR);
    const yearEnd = await PayrollRunService.prepareYearEnd({ organizationId, year: 2026, payDate: "2026-12-28" }, HR);
    const yearEndFigures = await figures(yearEnd._id);
    expect(yearEndFigures.length).toBeGreaterThan(0);
    await PayrollRunService.act(yearEnd._id.toString(), { organizationId, action: "recompute" }, HR);
    expect(await figures(yearEnd._id)).toEqual(yearEndFigures);
  });
});

describe("authorization (§60): who can prepare each run type", () => {
  beforeEach(async () => {
    await connectMongoDB();
    session.mockReset();
  });

  async function users(organizationId: string, projectId: string) {
    const role = await RoleModel.create({ organizationId, name: `Payroll ${Math.random()}`, permissionKeys: ["payroll-runs.read", "payroll-runs.create"] });
    const [orgWide, projectOnly] = await Promise.all([
      UserModel.create({ username: `hr.${Math.random()}`, passwordHash: "x" }),
      UserModel.create({ username: `pm.${Math.random()}`, passwordHash: "x" }),
    ]);
    const past = new Date(Date.now() - 60_000);
    await RoleAssignmentModel.create({ organizationId, roleId: role._id, userId: orgWide._id, scope: { type: "organization" }, effectiveFrom: past });
    await RoleAssignmentModel.create({ organizationId, roleId: role._id, userId: projectOnly._id, scope: { type: "project", projectIds: [new Types.ObjectId(projectId)] }, effectiveFrom: past });
    return { orgWide: orgWide._id.toString(), projectOnly: projectOnly._id.toString() };
  }

  const post = (route: { POST: (request: NextRequest) => Promise<Response> }, url: string, body: unknown) =>
    route.POST(new NextRequest(new URL(url, "http://localhost:4100"), { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }));

  it("HR with an organization-wide role prepares every run type; a project-scoped holder of the same role can't", async () => {
    const { organizationId, projectId } = await seedCrew();
    await PayrollRuleVersionService.create({ organizationId, ...PH_STATUTORY_2025, ...PH_YEAR_END_2023, name: "PH with year-end", effectiveFrom: "2026-12-01" }, HR);
    const { orgWide, projectOnly } = await users(organizationId, projectId);
    const calls = [
      () => post(regularRoute, "/api/payroll-runs", { organizationId, ...OCTOBER }),
      () => post(thirteenthRoute, "/api/payroll-runs/thirteenth-month", { organizationId, year: 2026, payDate: "2026-12-20" }),
    ];

    session.mockResolvedValue({ user: { id: projectOnly } });
    for (const call of calls) expect((await call()).status).toBe(403);
    expect((await post(yearEndRoute, "/api/payroll-runs/year-end", { organizationId, year: 2026, payDate: "2026-12-28" })).status).toBe(403);

    session.mockResolvedValue({ user: { id: orgWide } });
    const regular = await calls[0]();
    expect(regular.status).toBe(201);
    const { run } = (await regular.json()) as { run: { _id: string } };
    await release(run._id, organizationId);
    expect((await calls[1]()).status).toBe(201);
    // The year-end run waits for every regular run of the year to be finished, so cancel the 13th-month draft first.
    const thirteenthDraft = await PayrollRunModel.findOne({ organizationId, runType: "thirteenth_month" }).lean();
    await PayrollRunService.act(thirteenthDraft!._id.toString(), { organizationId, action: "cancel", reason: "Test" }, HR);
    expect((await post(yearEndRoute, "/api/payroll-runs/year-end", { organizationId, year: 2026, payDate: "2026-12-28" })).status).toBe(201);
  });
});
