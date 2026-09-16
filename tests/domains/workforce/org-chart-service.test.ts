import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import {
  OrganizationModel,
  PersonModel,
  EmployeeModel,
  PositionModel,
  ProjectModel,
  EmployeeAssignmentModel,
} from "@/server/db/models";
import { OrgChartService } from "@/domains/workforce/org-chart-service";
import { EmployeeAssignmentService } from "@/domains/workforce/employee-assignment-service";

async function seedEmployee(organizationId: object, suffix: string) {
  const person = await PersonModel.create({ organizationId, firstName: `First${suffix}`, lastName: `Last${suffix}` });
  return EmployeeModel.create({ organizationId, personId: person._id, employeeNumber: `EMP-${suffix}-${Date.now()}-${Math.random()}` });
}

describe("OrgChartService", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("builds a parent/child tree from reportsToEmployeeId", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-chart-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();

    const ceo = await seedEmployee(organization._id, "CEO");
    const manager = await seedEmployee(organization._id, "MGR");
    const report = await seedEmployee(organization._id, "REP");

    await EmployeeAssignmentService.create({ organizationId: orgId, employeeId: ceo._id.toString() }, {});
    await EmployeeAssignmentService.create(
      { organizationId: orgId, employeeId: manager._id.toString(), reportsToEmployeeId: ceo._id.toString() },
      {},
    );
    await EmployeeAssignmentService.create(
      { organizationId: orgId, employeeId: report._id.toString(), reportsToEmployeeId: manager._id.toString() },
      {},
    );

    const snapshot = await OrgChartService.getSnapshot(orgId, {});

    expect(snapshot.roots).toHaveLength(1);
    expect(snapshot.roots[0].employeeId).toBe(ceo._id.toString());
    expect(snapshot.roots[0].children).toHaveLength(1);
    expect(snapshot.roots[0].children[0].employeeId).toBe(manager._id.toString());
    expect(snapshot.roots[0].children[0].children[0].employeeId).toBe(report._id.toString());
  });

  it("reconstructs the historical manager as of a past date, and the current manager for now", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-chart-hist-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();

    const managerB = await seedEmployee(organization._id, "B");
    const managerC = await seedEmployee(organization._id, "C");
    const employee = await seedEmployee(organization._id, "EMP");

    const date2025 = new Date("2025-01-15T00:00:00Z");
    const date2026 = new Date("2026-01-15T00:00:00Z");
    const midway2025 = new Date("2025-06-01T00:00:00Z");

    // Managers need their own assignment to appear as tree nodes at all —
    // a manager with no assignment of their own can't be a node, so their
    // reports would surface as roots instead (this is exercised on its own
    // in the "re-roots" test below).
    await EmployeeAssignmentService.create({ organizationId: orgId, employeeId: managerB._id.toString(), effectiveFrom: date2025 }, {});
    await EmployeeAssignmentService.create({ organizationId: orgId, employeeId: managerC._id.toString(), effectiveFrom: date2025 }, {});

    await EmployeeAssignmentService.create(
      { organizationId: orgId, employeeId: employee._id.toString(), reportsToEmployeeId: managerB._id.toString(), effectiveFrom: date2025 },
      {},
    );
    await EmployeeAssignmentService.transfer(
      employee._id.toString(),
      orgId,
      { reportsToEmployeeId: managerC._id.toString(), effectiveFrom: date2026 },
      {},
    );

    const historical = await OrgChartService.getSnapshot(orgId, { asOf: midway2025 });
    const historicalManagerB = historical.roots.find((root) => root.employeeId === managerB._id.toString());
    const historicalManagerC = historical.roots.find((root) => root.employeeId === managerC._id.toString());
    expect(historicalManagerB?.children.map((c) => c.employeeId)).toContain(employee._id.toString());
    expect(historicalManagerC?.children.map((c) => c.employeeId) ?? []).not.toContain(employee._id.toString());

    const current = await OrgChartService.getSnapshot(orgId, {});
    const currentManagerC = current.roots.find((root) => root.employeeId === managerC._id.toString());
    expect(currentManagerC?.children.map((c) => c.employeeId)).toContain(employee._id.toString());
  });

  it("lists an active position with no current assignment as vacant, and excludes a filled one", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-chart-vacant-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();

    const filledPosition = await PositionModel.create({ organizationId: organization._id, title: "Filled", code: `F-${Date.now()}` });
    const vacantPosition = await PositionModel.create({ organizationId: organization._id, title: "Vacant", code: `V-${Date.now()}` });
    const employee = await seedEmployee(organization._id, "HOLDER");
    await EmployeeAssignmentService.create(
      { organizationId: orgId, employeeId: employee._id.toString(), positionId: filledPosition._id.toString() },
      {},
    );

    const snapshot = await OrgChartService.getSnapshot(orgId, {});

    expect(snapshot.vacantPositions.map((position) => position.id)).toContain(vacantPosition._id.toString());
    expect(snapshot.vacantPositions.map((position) => position.id)).not.toContain(filledPosition._id.toString());
  });

  it("re-roots an employee whose manager was filtered out of the set", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-chart-filter-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();

    const projectA = await ProjectModel.create({ organizationId: organization._id, name: "Project A", code: `PA-${Date.now()}` });
    const manager = await seedEmployee(organization._id, "MGRNOPROJECT");
    const report = await seedEmployee(organization._id, "REPINPROJECT");

    await EmployeeAssignmentService.create({ organizationId: orgId, employeeId: manager._id.toString() }, {});
    await EmployeeAssignmentService.create(
      {
        organizationId: orgId,
        employeeId: report._id.toString(),
        reportsToEmployeeId: manager._id.toString(),
        projectId: projectA._id.toString(),
      },
      {},
    );

    const snapshot = await OrgChartService.getSnapshot(orgId, { projectId: projectA._id.toString() });

    expect(snapshot.roots).toHaveLength(1);
    expect(snapshot.roots[0].employeeId).toBe(report._id.toString());
    expect(snapshot.roots[0].children).toHaveLength(0);
  });

  it("does not hang and surfaces every member when the reporting chain contains a cycle", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-chart-cycle-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();

    const a = await seedEmployee(organization._id, "A");
    const b = await seedEmployee(organization._id, "B");

    await EmployeeAssignmentService.create({ organizationId: orgId, employeeId: a._id.toString() }, {});
    await EmployeeAssignmentService.create({ organizationId: orgId, employeeId: b._id.toString() }, {});
    // Force a 2-cycle directly at the data layer — the service must not
    // block this at create-time (only direct self-report is blocked), but
    // getSnapshot must still terminate and must not silently drop either.
    await EmployeeAssignmentModel.updateOne(
      { employeeId: a._id, organizationId: orgId },
      { $set: { reportsToEmployeeId: b._id } },
    );
    await EmployeeAssignmentModel.updateOne(
      { employeeId: b._id, organizationId: orgId },
      { $set: { reportsToEmployeeId: a._id } },
    );

    const snapshot = await OrgChartService.getSnapshot(orgId, {});
    const rootIds = snapshot.roots.map((root) => root.employeeId);

    expect(rootIds).toContain(a._id.toString());
    expect(rootIds).toContain(b._id.toString());
  });
});
