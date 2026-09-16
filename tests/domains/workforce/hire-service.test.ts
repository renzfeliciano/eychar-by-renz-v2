import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, PositionModel } from "@/server/db/models";
import { HireService } from "@/domains/workforce/hire-service";
import { EmploymentService } from "@/domains/workforce/employment-service";
import { EmployeeAssignmentService } from "@/domains/workforce/employee-assignment-service";

describe("HireService", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("creates a person, employee, employment, and initial assignment in one call", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-hire-${Date.now()}` });
    const position = await PositionModel.create({ organizationId: organization._id, title: "Engineer", code: `ENG-${Date.now()}` });

    const result = await HireService.hire(
      {
        organizationId: organization._id.toString(),
        firstName: "Jane",
        lastName: "Doe",
        employeeNumber: `EMP-HIRE-${Date.now()}`,
        employmentType: "regular",
        positionId: position._id.toString(),
      },
      {},
    );

    expect(result.person.firstName).toBe("Jane");
    expect(result.employee.personId.toString()).toBe(result.person._id.toString());

    const currentEmployment = await EmploymentService.getCurrent(result.employee._id.toString());
    expect(currentEmployment?.status).toBe("active");

    const currentAssignment = await EmployeeAssignmentService.getCurrent(result.employee._id.toString());
    expect(currentAssignment?.positionId?.toString()).toBe(position._id.toString());
  });
});
