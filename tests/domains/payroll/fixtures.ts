import { Types } from "mongoose";
import {
  OrganizationModel,
  PersonModel,
  EmployeeModel,
  EmploymentModel,
  EmployeeAssignmentModel,
  ProjectModel,
  AttendanceRecordModel,
} from "@/server/db/models";
import { EmploymentStatusService } from "@/domains/catalog/employment-status-service";
import { PayrollPolicyService } from "@/domains/payroll/payroll-policy-service";
import { PayrollRuleVersionService } from "@/domains/payroll/payroll-rule-version-service";
import { CompensationService } from "@/domains/payroll/compensation-service";
import { PH_STATUTORY_2025 } from "@/domains/payroll/templates/ph-statutory-2025";
import { dateKeyToDate } from "@/lib/date-key";

/** An organization with active/resigned statuses and, unless told otherwise, a semi-monthly policy and the PH rule version. */
export async function seedPayrollOrganization(options: { withPolicy?: boolean; withRules?: boolean; contributionTiming?: "every_cutoff" | "last_cutoff_of_month" } = {}) {
  const organization = await OrganizationModel.create({ name: "Acme Builders", slug: `acme-payroll-${Date.now()}-${Math.random()}` });
  const organizationId = organization._id.toString();
  await EmploymentStatusService.create({ organizationId, code: "active", name: "Active", metadata: { isActiveHeadcount: true } }, {});
  await EmploymentStatusService.create({ organizationId, code: "resigned", name: "Resigned", metadata: { isActiveHeadcount: false } }, {});
  if (options.withPolicy !== false) {
    await PayrollPolicyService.create(
      {
        organizationId,
        name: "Standard",
        payFrequency: "semi-monthly",
        workDaysPerYear: 261,
        hoursPerDay: 8,
        finalPayDeadlineDays: 30,
        workWeekDays: [1, 2, 3, 4, 5],
        deductLateAndUndertime: true,
        contributionTiming: options.contributionTiming ?? "every_cutoff",
        effectiveFrom: "2026-01-01",
      },
      {},
    );
  }
  if (options.withRules !== false) {
    await PayrollRuleVersionService.create({ organizationId, ...PH_STATUTORY_2025, effectiveFrom: "2026-01-01" }, {});
  }
  const project = await ProjectModel.create({ organizationId, name: "EGI Rufino", code: `RUF-${Math.random()}` });
  const otherProject = await ProjectModel.create({ organizationId, name: "Makati Tower", code: `MKT-${Math.random()}` });
  return { organizationId, projectId: project._id.toString(), otherProjectId: otherProject._id.toString() };
}

export async function seedEmployee(
  organizationId: string,
  firstName: string,
  options: {
    status?: string;
    hiredOn?: string;
    projectId?: string;
    compensation?: { rateType: "monthly" | "daily"; rate: number; minimumWageEarner?: boolean; allowances?: { name: string; amount: number; basis: "monthly" | "daily"; taxable: boolean }[] } | null;
  } = {},
) {
  const person = await PersonModel.create({ organizationId, firstName, lastName: "Santos" });
  const employee = await EmployeeModel.create({ organizationId, personId: person._id, employeeNumber: `EMP-${firstName}` });
  const employeeId = employee._id.toString();
  await EmploymentModel.create({
    organizationId,
    employeeId,
    employmentType: "regular",
    status: options.status ?? "active",
    effectiveFrom: dateKeyToDate(options.hiredOn ?? "2025-01-01"),
  });
  if (options.projectId) {
    await EmployeeAssignmentModel.create({ organizationId, employeeId, projectId: new Types.ObjectId(options.projectId), effectiveFrom: dateKeyToDate("2025-01-01") });
  }
  if (options.compensation !== null) {
    const terms = options.compensation ?? { rateType: "monthly" as const, rate: 30000 };
    await CompensationService.create(
      { organizationId, employeeId, allowances: [], minimumWageEarner: false, effectiveFrom: "2025-01-01", ...terms },
      {},
    );
  }
  return employeeId;
}

export async function markAttendance(organizationId: string, employeeId: string, date: string, status: string) {
  await AttendanceRecordModel.create({ organizationId, employeeId, date: dateKeyToDate(date), status });
}
