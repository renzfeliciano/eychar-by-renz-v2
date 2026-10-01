import { describe, it, expect, beforeEach } from "vitest";
import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { EmployeeAssignmentModel, EmployeeModel, EmploymentModel, OrganizationModel, PersonModel } from "@/server/db/models";
import { EmployeeRosterService } from "@/domains/workforce/employee-roster-service";

const unique = () => `${Date.now()}-${Math.random()}`;

async function seedEmployee(
  organizationId: Types.ObjectId,
  input: { first: string; last: string; number: string; type?: string; status?: string; hired?: string; positionId?: Types.ObjectId; ids?: boolean },
) {
  const person = await PersonModel.create({
    organizationId,
    firstName: input.first,
    lastName: input.last,
    ...(input.ids ? { sssNumber: "34-1234567-8", philHealthNumber: "12-345678901-2", pagIbigNumber: "1234-5678-9012", tinNumber: "123-456-789-000" } : {}),
  });
  const employee = await EmployeeModel.create({ organizationId, personId: person._id, employeeNumber: input.number });
  // An older employment first: only the latest one counts.
  await EmploymentModel.create({ organizationId, employeeId: employee._id, employmentType: "contractual", status: "terminated", effectiveFrom: new Date("2020-01-01") });
  await EmploymentModel.create({
    organizationId,
    employeeId: employee._id,
    employmentType: input.type ?? "regular",
    status: input.status ?? "active",
    effectiveFrom: new Date(input.hired ?? "2024-01-01"),
  });
  if (input.positionId) await EmployeeAssignmentModel.create({ organizationId, employeeId: employee._id, positionId: input.positionId, effectiveFrom: new Date("2024-01-01") });
  return employee;
}

describe("EmployeeRosterService", () => {
  let organizationId: Types.ObjectId;
  const engineer = new Types.ObjectId();

  beforeEach(async () => {
    await connectMongoDB();
    const organization = await OrganizationModel.create({ name: "Roster Co", slug: `roster-${unique()}` });
    organizationId = organization._id;
    await seedEmployee(organizationId, { first: "Ana", last: "Cruz", number: "E-003", hired: "2023-05-01", ids: true });
    await seedEmployee(organizationId, { first: "Ben", last: "Reyes", number: "E-001", type: "probationary", positionId: engineer });
    await seedEmployee(organizationId, { first: "Carla", last: "Santos", number: "E-002", status: "resigned" });
    // Another organization's employee never shows up.
    const other = await OrganizationModel.create({ name: "Other", slug: `roster-other-${unique()}` });
    await seedEmployee(other._id, { first: "Ana", last: "Outsider", number: "X-001" });
  });

  const base = { dir: "asc" as const, page: 1, pageSize: 10 };

  it("reads one page at a time, with the total, using each employee's latest employment", async () => {
    const first = await EmployeeRosterService.page(organizationId.toString(), { ...base, sort: "name", pageSize: 2 });
    expect(first.total).toBe(3);
    expect(first.rows.map((row) => row.person?.firstName)).toEqual(["Ana", "Ben"]);
    expect(first.rows[0].currentEmployment?.status).toBe("active");

    const second = await EmployeeRosterService.page(organizationId.toString(), { ...base, sort: "name", pageSize: 2, page: 2 });
    expect(second.rows.map((row) => row.person?.firstName)).toEqual(["Carla"]);
  });

  it("searches by name, employee number and matching position, inside this organization only", async () => {
    const byName = await EmployeeRosterService.page(organizationId.toString(), { ...base, q: "ana cruz" });
    expect(byName.rows.map((row) => row.employeeNumber)).toEqual(["E-003"]);

    const byNumber = await EmployeeRosterService.page(organizationId.toString(), { ...base, q: "e-002" });
    expect(byNumber.rows.map((row) => row.person?.lastName)).toEqual(["Santos"]);

    const byPosition = await EmployeeRosterService.page(organizationId.toString(), { ...base, q: "engineer", positionIdsMatchingQ: [engineer.toString()] });
    expect(byPosition.rows.map((row) => row.person?.firstName)).toEqual(["Ben"]);

    const regexCharacters = await EmployeeRosterService.page(organizationId.toString(), { ...base, q: ".*" });
    expect(regexCharacters.total).toBe(0);
  });

  it("filters by employment type and sorts by the requested column", async () => {
    const probationary = await EmployeeRosterService.page(organizationId.toString(), { ...base, employmentType: "probationary" });
    expect(probationary.rows.map((row) => row.person?.firstName)).toEqual(["Ben"]);

    const byNumberDesc = await EmployeeRosterService.page(organizationId.toString(), { ...base, sort: "employeeNumber", dir: "desc" });
    expect(byNumberDesc.rows.map((row) => row.employeeNumber)).toEqual(["E-003", "E-002", "E-001"]);

    const byService = await EmployeeRosterService.page(organizationId.toString(), { ...base, sort: "lengthOfService" });
    expect(byService.rows[0].employeeNumber).toBe("E-003");
  });

  it("summarizes the whole roster without returning anyone's details", async () => {
    const summary = await EmployeeRosterService.summary(organizationId.toString(), new Set(["active"]), new Date("2024-02-15"));
    expect(summary.headcount).toBe(2);
    expect(summary.statusCounts.get("resigned")).toBe(1);
    expect(summary.newHires).toBe(1);
    expect(summary.missingIds).toBe(1);
  });

  it("builds export rows for the organization, optionally one employment type", async () => {
    const lookups = { positionTitleById: new Map([[engineer.toString(), "Engineer"]]), projectNameById: new Map(), statusNameByCode: new Map([["active", "Active"]]) };
    const all = await EmployeeRosterService.exportRows(organizationId.toString(), lookups);
    expect(all.map((row) => row.name)).toEqual(["Ana Cruz", "Ben Reyes", "Carla Santos"]);
    expect(all[0].sssNumber).toBe("34-1234567-8");
    expect(all[1].position).toBe("Engineer");

    const probationary = await EmployeeRosterService.exportRows(organizationId.toString(), lookups, "probationary");
    expect(probationary.map((row) => row.name)).toEqual(["Ben Reyes"]);
  });
});
