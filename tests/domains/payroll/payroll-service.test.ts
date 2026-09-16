import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import {
  OrganizationModel,
  PersonModel,
  EmployeeModel,
  AttendanceRecordModel,
  PayrollRunModel,
  PayrollRecordModel,
  AuditLogModel,
} from "@/server/db/models";
import { PayrollPolicyService } from "@/domains/payroll/payroll-policy-service";
import { PayrollRuleVersionService } from "@/domains/payroll/payroll-rule-version-service";
import { CompensationService } from "@/domains/payroll/compensation-service";
import { PayrollService } from "@/domains/payroll/payroll-service";
import { BusinessRuleError, NotFoundError } from "@/shared/errors";

const BRACKETS = [
  { minIncome: 0, maxIncome: 15000, rate: 0, baseDeduction: 0 },
  { minIncome: 15000, rate: 0.1, baseDeduction: 0 },
];
const CONTRIBUTIONS = [{ name: "SSS", employeeRate: 0.05, cap: 20000 }];
const DAY_MS = 24 * 60 * 60 * 1000;

// A payroll period must be captured *after* every policy/rule-version/
// compensation row is seeded (each defaults its own effectiveFrom to the
// literal moment of creation) so payPeriodStart is guaranteed later in
// wall-clock time than every one of them — the same "now vs. a fixed
// calendar date" trap ADR-011 already documented once for Attendance.
function periodStartingNow() {
  const payPeriodStart = new Date();
  const payPeriodEnd = new Date(payPeriodStart.getTime() + 14 * DAY_MS);
  return { payPeriodStart, payPeriodEnd };
}

async function seedOrgPolicyAndRules(suffix: string, standardWorkDaysPerPeriod = 20) {
  const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-pr-${suffix}-${Date.now()}-${Math.random()}` });
  await PayrollPolicyService.create(
    { organizationId: organization._id.toString(), name: "Standard", payFrequency: "semi-monthly", standardWorkDaysPerPeriod },
    {},
  );
  await PayrollRuleVersionService.create(
    { organizationId: organization._id.toString(), taxBrackets: BRACKETS, statutoryContributions: CONTRIBUTIONS },
    {},
  );
  return organization;
}

async function seedEmployeeWithCompensation(organizationId: string, suffix: string, baseSalary: number, allowanceAmount = 0) {
  const person = await PersonModel.create({ organizationId, firstName: "Jane", lastName: `Doe-${suffix}` });
  const employee = await EmployeeModel.create({
    organizationId,
    personId: person._id,
    employeeNumber: `EMP-${suffix}-${Date.now()}-${Math.random()}`,
  });
  await CompensationService.create({ organizationId, employeeId: employee._id.toString(), baseSalary, allowanceAmount }, {});
  return employee;
}

async function markAttendance(organizationId: string, employeeId: string, date: Date, status: string) {
  await AttendanceRecordModel.create({ organizationId, employeeId, date, status });
}

describe("PayrollService.generateRun", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("computes full basic salary with zero absences", async () => {
    const organization = await seedOrgPolicyAndRules("1");
    const employee = await seedEmployeeWithCompensation(organization._id.toString(), "1", 20000);
    const { payPeriodStart, payPeriodEnd } = periodStartingNow();

    const { records } = await PayrollService.generateRun(
      { organizationId: organization._id.toString(), payPeriodStart, payPeriodEnd, adjustments: [] },
      {},
    );

    const record = records.find((r) => r.employeeId.toString() === employee._id.toString());
    expect(record?.basicSalary).toBe(20000);
  });

  it("prorates basic salary down for absent days, and does not count on_leave days as unpaid", async () => {
    const organization = await seedOrgPolicyAndRules("2", 20);
    const employee = await seedEmployeeWithCompensation(organization._id.toString(), "2", 20000);
    const { payPeriodStart, payPeriodEnd } = periodStartingNow();
    await markAttendance(organization._id.toString(), employee._id.toString(), new Date(payPeriodStart.getTime() + 2 * DAY_MS), "absent");
    await markAttendance(organization._id.toString(), employee._id.toString(), new Date(payPeriodStart.getTime() + 3 * DAY_MS), "absent");
    await markAttendance(organization._id.toString(), employee._id.toString(), new Date(payPeriodStart.getTime() + 4 * DAY_MS), "on_leave");

    const { records } = await PayrollService.generateRun(
      { organizationId: organization._id.toString(), payPeriodStart, payPeriodEnd, adjustments: [] },
      {},
    );

    const record = records.find((r) => r.employeeId.toString() === employee._id.toString());
    // 20 standard work days, 2 unpaid absences -> 18/20 of base salary. on_leave does not reduce it further.
    expect(record?.basicSalary).toBe(20000 * (18 / 20));
  });

  it("computes gross/tax/statutory/net with addition and deduction adjustments moving net pay the right direction", async () => {
    const organization = await seedOrgPolicyAndRules("3", 20);
    const employee = await seedEmployeeWithCompensation(organization._id.toString(), "3", 18000, 1000);
    const { payPeriodStart, payPeriodEnd } = periodStartingNow();

    const { records } = await PayrollService.generateRun(
      {
        organizationId: organization._id.toString(),
        payPeriodStart,
        payPeriodEnd,
        adjustments: [
          { employeeId: employee._id.toString(), category: "overtime", direction: "addition", amount: 500 },
          { employeeId: employee._id.toString(), category: "loan", direction: "deduction", amount: 300 },
        ],
      },
      {},
    );

    const record = records.find((r) => r.employeeId.toString() === employee._id.toString())!;
    expect(record.basicSalary).toBe(18000);
    expect(record.grossPay).toBe(18000 + 1000 + 500);
    expect(record.taxDeduction).toBeCloseTo(0.1 * (19500 - 15000));
    expect(record.statutoryDeductions).toHaveLength(1);
    expect(record.statutoryDeductions[0].name).toBe("SSS");
    expect(record.statutoryDeductions[0].employeeAmount).toBeCloseTo(19500 * 0.05);
    expect(record.adjustmentsTotal).toBe(500 - 300);
    expect(record.netPay).toBeCloseTo(19500 - 450 - 975 - 300);
  });

  it("throws before writing anything when an employee has no resolvable Compensation", async () => {
    const organization = await seedOrgPolicyAndRules("4");
    await seedEmployeeWithCompensation(organization._id.toString(), "4a", 20000);
    // Second employee with no Compensation at all.
    const person = await PersonModel.create({ organizationId: organization._id, firstName: "No", lastName: "Comp" });
    await EmployeeModel.create({
      organizationId: organization._id,
      personId: person._id,
      employeeNumber: `EMP-4b-${Date.now()}`,
    });
    const { payPeriodStart, payPeriodEnd } = periodStartingNow();

    await expect(
      PayrollService.generateRun(
        { organizationId: organization._id.toString(), payPeriodStart, payPeriodEnd, adjustments: [] },
        {},
      ),
    ).rejects.toThrow(BusinessRuleError);

    const runs = await PayrollRunModel.find({ organizationId: organization._id }).lean();
    const records = await PayrollRecordModel.find({ organizationId: organization._id }).lean();
    expect(runs).toHaveLength(0);
    expect(records).toHaveLength(0);
  });

  it("throws when no PayrollPolicy or PayrollRuleVersion resolves for the organization", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-pr-5-${Date.now()}` });
    const { payPeriodStart, payPeriodEnd } = periodStartingNow();

    await expect(
      PayrollService.generateRun(
        { organizationId: organization._id.toString(), payPeriodStart, payPeriodEnd, adjustments: [] },
        {},
      ),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("PayrollService.approve", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("approves a completed run and audits before/after", async () => {
    const organization = await seedOrgPolicyAndRules("6");
    await seedEmployeeWithCompensation(organization._id.toString(), "6", 20000);
    const { payPeriodStart, payPeriodEnd } = periodStartingNow();
    const { run } = await PayrollService.generateRun(
      { organizationId: organization._id.toString(), payPeriodStart, payPeriodEnd, adjustments: [] },
      {},
    );

    const approved = await PayrollService.approve(run._id.toString(), organization._id.toString(), {});

    expect(approved.status).toBe("approved");
    const audits = await AuditLogModel.find({ resourceId: run._id, action: "payroll-run.approved" }).lean();
    expect(audits).toHaveLength(1);
    expect(audits[0].before).toMatchObject({ status: "completed" });
    expect(audits[0].after).toMatchObject({ status: "approved" });
  });

  it("rejects approving a run that is already approved", async () => {
    const organization = await seedOrgPolicyAndRules("7");
    await seedEmployeeWithCompensation(organization._id.toString(), "7", 20000);
    const { payPeriodStart, payPeriodEnd } = periodStartingNow();
    const { run } = await PayrollService.generateRun(
      { organizationId: organization._id.toString(), payPeriodStart, payPeriodEnd, adjustments: [] },
      {},
    );
    await PayrollService.approve(run._id.toString(), organization._id.toString(), {});

    await expect(PayrollService.approve(run._id.toString(), organization._id.toString(), {})).rejects.toThrow(BusinessRuleError);
  });
});
