import { describe, it, expect, beforeEach } from "vitest";
import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, PersonModel, EmployeeModel, EmploymentModel, EmployeeAssignmentModel } from "@/server/db/models";
import { EmploymentStatusService } from "@/domains/catalog/employment-status-service";
import { loadHeadcount } from "@/domains/workforce/headcount";

describe("loadHeadcount", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("counts current staff per unit, position, project and location, and who isn't assigned", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-hc-${Date.now()}-${Math.random()}` });
    const organizationId = organization._id.toString();
    await EmploymentStatusService.create({ organizationId, code: "active", name: "Active", metadata: { isActiveHeadcount: true } }, {});
    await EmploymentStatusService.create({ organizationId, code: "resigned", name: "Resigned", metadata: { isActiveHeadcount: false } }, {});
    const unit = new Types.ObjectId();
    const position = new Types.ObjectId();
    const project = new Types.ObjectId();

    async function hire(name: string, status: string, assignment: Record<string, Types.ObjectId> | null) {
      const person = await PersonModel.create({ organizationId, firstName: name, lastName: "Santos" });
      const employee = await EmployeeModel.create({ organizationId, personId: person._id, employeeNumber: `EMP-${name}-${Math.random()}` });
      await EmploymentModel.create({ organizationId, employeeId: employee._id, employmentType: "regular", status });
      if (assignment) await EmployeeAssignmentModel.create({ organizationId, employeeId: employee._id, ...assignment });
    }
    await hire("Angela", "active", { organizationUnitId: unit, positionId: position, projectId: project });
    await hire("Carlos", "active", { organizationUnitId: unit, positionId: position });
    await hire("Maria", "active", null);
    await hire("Former", "resigned", { organizationUnitId: unit, positionId: position, projectId: project });

    const headcount = await loadHeadcount(organizationId);

    expect(headcount.total).toBe(3);
    expect(headcount.byUnit.get(unit.toString())).toBe(2);
    expect(headcount.byPosition.get(position.toString())).toBe(2);
    expect(headcount.byProject.get(project.toString())).toBe(1);
    expect(headcount.unassigned).toEqual({ unit: 1, position: 1, project: 2, location: 3 });
  });
});
