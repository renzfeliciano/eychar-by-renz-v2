import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import {
  OrganizationModel,
  PersonModel,
  EmployeeModel,
  PositionModel,
  ProjectModel,
} from "@/server/db/models";
import { EmployeeAssignmentService } from "@/domains/workforce/employee-assignment-service";
import { NotFoundError, BusinessRuleError } from "@/shared/errors";

async function seedScenario() {
  const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-${Date.now()}-${Math.random()}` });
  const orgId = organization._id.toString();

  const person = await PersonModel.create({ organizationId: organization._id, firstName: "Employee", lastName: "A" });
  const employee = await EmployeeModel.create({
    organizationId: organization._id,
    personId: person._id,
    employeeNumber: `EMP-${Date.now()}-${Math.random()}`,
  });

  const managerPerson = await PersonModel.create({ organizationId: organization._id, firstName: "Manager", lastName: "B" });
  const managerB = await EmployeeModel.create({
    organizationId: organization._id,
    personId: managerPerson._id,
    employeeNumber: `MGR-B-${Date.now()}-${Math.random()}`,
  });
  const managerCPerson = await PersonModel.create({ organizationId: organization._id, firstName: "Manager", lastName: "C" });
  const managerC = await EmployeeModel.create({
    organizationId: organization._id,
    personId: managerCPerson._id,
    employeeNumber: `MGR-C-${Date.now()}-${Math.random()}`,
  });

  const supervisorPosition = await PositionModel.create({ organizationId: organization._id, title: "Supervisor", code: `SUP-${Date.now()}` });
  const opsManagerPosition = await PositionModel.create({ organizationId: organization._id, title: "Operations Manager", code: `OPSMGR-${Date.now()}` });
  const projectA = await ProjectModel.create({ organizationId: organization._id, name: "Project A", code: `PA-${Date.now()}` });
  const projectB = await ProjectModel.create({ organizationId: organization._id, name: "Project B", code: `PB-${Date.now()}` });

  return { organization, orgId, employee, managerB, managerC, supervisorPosition, opsManagerPosition, projectA, projectB };
}

describe("EmployeeAssignmentService — required historical test (AGENTS.md §59)", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("preserves the 2025 assignment, creates the 2026 assignment, and keeps the same employee identity", async () => {
    const s = await seedScenario();
    const date2025 = new Date("2025-01-15T00:00:00Z");
    const date2026 = new Date("2026-01-15T00:00:00Z");
    const midway = new Date("2025-06-01T00:00:00Z");

    const assignment2025 = await EmployeeAssignmentService.create(
      {
        organizationId: s.orgId,
        employeeId: s.employee._id.toString(),
        positionId: s.supervisorPosition._id.toString(),
        projectId: s.projectA._id.toString(),
        reportsToEmployeeId: s.managerB._id.toString(),
        effectiveFrom: date2025,
      },
      {},
    );

    const assignment2026 = await EmployeeAssignmentService.transfer(
      s.employee._id.toString(),
      s.orgId,
      {
        positionId: s.opsManagerPosition._id.toString(),
        projectId: s.projectB._id.toString(),
        reportsToEmployeeId: s.managerC._id.toString(),
        effectiveFrom: date2026,
      },
      {},
    );

    // Same employee identity throughout.
    expect(assignment2026.employeeId.toString()).toBe(s.employee._id.toString());

    // The 2025 assignment is preserved, not deleted — only closed out.
    const preserved2025 = await EmployeeAssignmentService.getAsOf(s.employee._id.toString(), midway);
    expect(preserved2025?._id.toString()).toBe(assignment2025._id.toString());
    expect(preserved2025?.positionId?.toString()).toBe(s.supervisorPosition._id.toString());
    expect(preserved2025?.reportsToEmployeeId?.toString()).toBe(s.managerB._id.toString());

    // The current organization displays the 2026 state correctly.
    const current = await EmployeeAssignmentService.getCurrent(s.employee._id.toString());
    expect(current?._id.toString()).toBe(assignment2026._id.toString());
    expect(current?.positionId?.toString()).toBe(s.opsManagerPosition._id.toString());
    expect(current?.projectId?.toString()).toBe(s.projectB._id.toString());
    expect(current?.reportsToEmployeeId?.toString()).toBe(s.managerC._id.toString());

    // Both states remain available in history.
    const history = await EmployeeAssignmentService.getHistory(s.employee._id.toString());
    expect(history).toHaveLength(2);
    expect(history[0]._id.toString()).toBe(assignment2025._id.toString());
    expect(history[1]._id.toString()).toBe(assignment2026._id.toString());
  });

  it("inherits fields the transfer didn't specify from the current assignment, instead of blanking them out", async () => {
    const s = await seedScenario();
    await EmployeeAssignmentService.create(
      {
        organizationId: s.orgId,
        employeeId: s.employee._id.toString(),
        positionId: s.supervisorPosition._id.toString(),
        projectId: s.projectA._id.toString(),
        reportsToEmployeeId: s.managerB._id.toString(),
      },
      {},
    );

    // Only the position is specified — project and manager should carry over.
    const transferred = await EmployeeAssignmentService.transfer(
      s.employee._id.toString(),
      s.orgId,
      { positionId: s.opsManagerPosition._id.toString() },
      {},
    );

    expect(transferred.positionId?.toString()).toBe(s.opsManagerPosition._id.toString());
    expect(transferred.projectId?.toString()).toBe(s.projectA._id.toString());
    expect(transferred.reportsToEmployeeId?.toString()).toBe(s.managerB._id.toString());
  });

  it("rejects a transfer that doesn't specify anything to change", async () => {
    const s = await seedScenario();
    await EmployeeAssignmentService.create(
      { organizationId: s.orgId, employeeId: s.employee._id.toString(), positionId: s.supervisorPosition._id.toString() },
      {},
    );

    await expect(EmployeeAssignmentService.transfer(s.employee._id.toString(), s.orgId, {}, {})).rejects.toThrow(BusinessRuleError);
  });

  it("rejects a transfer that would leave position, project, or manager unset — no exceptions", async () => {
    const s = await seedScenario();

    // First-ever assignment for this employee — nothing to inherit, and
    // only two of the three required fields are supplied.
    await expect(
      EmployeeAssignmentService.transfer(
        s.employee._id.toString(),
        s.orgId,
        { positionId: s.supervisorPosition._id.toString(), reportsToEmployeeId: s.managerB._id.toString() },
        {},
      ),
    ).rejects.toThrow(BusinessRuleError);
  });

  it("allows a transfer once position, project, and manager are all specified", async () => {
    const s = await seedScenario();

    const assignment = await EmployeeAssignmentService.transfer(
      s.employee._id.toString(),
      s.orgId,
      {
        positionId: s.supervisorPosition._id.toString(),
        projectId: s.projectA._id.toString(),
        reportsToEmployeeId: s.managerB._id.toString(),
      },
      {},
    );

    expect(assignment.positionId?.toString()).toBe(s.supervisorPosition._id.toString());
    expect(assignment.projectId?.toString()).toBe(s.projectA._id.toString());
    expect(assignment.reportsToEmployeeId?.toString()).toBe(s.managerB._id.toString());
  });

  it("rejects a position that belongs to a different organization", async () => {
    const s = await seedScenario();
    const other = await OrganizationModel.create({ name: "Other", slug: `other-${Date.now()}-${Math.random()}` });
    const foreignPosition = await PositionModel.create({ organizationId: other._id, title: "Foreign", code: `F-${Date.now()}` });

    await expect(
      EmployeeAssignmentService.create(
        { organizationId: s.orgId, employeeId: s.employee._id.toString(), positionId: foreignPosition._id.toString() },
        {},
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it("rejects an employee reporting to themselves", async () => {
    const s = await seedScenario();

    await expect(
      EmployeeAssignmentService.create(
        {
          organizationId: s.orgId,
          employeeId: s.employee._id.toString(),
          reportsToEmployeeId: s.employee._id.toString(),
        },
        {},
      ),
    ).rejects.toThrow(BusinessRuleError);
  });
});
