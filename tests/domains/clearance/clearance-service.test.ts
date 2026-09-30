import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { AuditLogModel, EmployeeModel, OrganizationModel, PersonModel, UserModel } from "@/server/db/models";
import { ClearanceDepartmentService } from "@/domains/catalog/clearance-department-service";
import { SeparationTypeService } from "@/domains/catalog/separation-type-service";
import { ClearanceChecklistService } from "@/domains/clearance/clearance-checklist-service";
import { ClearanceService } from "@/domains/clearance/clearance-service";
import { AuthorizationError, BusinessRuleError, ConflictError, NotFoundError } from "@/shared/errors";

async function seed(suffix: string) {
  const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-clr-${suffix}-${Date.now()}-${Math.random()}` });
  const organizationId = organization._id.toString();
  await ClearanceDepartmentService.create({ organizationId, code: "it", name: "IT", sortOrder: 1 }, {});
  await ClearanceDepartmentService.create({ organizationId, code: "hr", name: "HR", sortOrder: 0 }, {});
  await SeparationTypeService.create({ organizationId, code: "resignation", name: "Resignation", sortOrder: 0 }, {});
  const laptop = await ClearanceChecklistService.create({ organizationId, departmentCode: "it", title: "Return laptop", blocking: true, dueDaysAfterLastDay: 0 }, {});
  await ClearanceChecklistService.create({ organizationId, departmentCode: "hr", title: "Exit interview", blocking: false, dueDaysAfterLastDay: 3 }, {});

  const person = await PersonModel.create({ organizationId, firstName: "Ana", lastName: "Reyes" });
  const employee = await EmployeeModel.create({ organizationId, personId: person._id, employeeNumber: `EMP-${Math.random()}` });
  const approver = await UserModel.create({ username: `hr.${Date.now()}.${Math.random()}`, passwordHash: "x" });
  const self = await UserModel.create({ username: `ana.${Date.now()}.${Math.random()}`, passwordHash: "x", personId: person._id });
  return { organizationId, employeeId: employee._id.toString(), laptopTemplateId: laptop._id.toString(), approverId: approver._id.toString(), selfUserId: self._id.toString() };
}

const OPEN = { separationTypeCode: "resignation", noticeDate: "2026-09-28", lastWorkingDay: "2026-10-10", noticeReference: "Resignation letter by email, 28 Sep 2026" };

describe("ClearanceService", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("opens a case with the checklist copied in, due dates counted from the last day, and audits it", async () => {
    const { organizationId, employeeId, approverId } = await seed("1");

    const opened = await ClearanceService.open({ organizationId, employeeId, ...OPEN }, { userId: approverId });

    expect(opened.status).toBe("in_clearance");
    expect(opened.caseNumber).toMatch(/^CLR-2026-\d{4}$/);
    expect(opened.items.map((entry) => [entry.departmentName, entry.title, entry.blocking])).toEqual([
      ["HR", "Exit interview", false],
      ["IT", "Return laptop", true],
    ]);
    expect(opened.items[0].dueDate?.toISOString().slice(0, 10)).toBe("2026-10-13");
    expect(await AuditLogModel.countDocuments({ resourceId: opened._id, action: "clearance.opened" })).toBe(1);
  });

  it("keeps a case's checklist as it was when opened, even if the template changes later", async () => {
    const { organizationId, employeeId, laptopTemplateId } = await seed("2");
    const opened = await ClearanceService.open({ organizationId, employeeId, ...OPEN }, {});

    await ClearanceChecklistService.update(laptopTemplateId, organizationId, { title: "Return laptop and charger" }, {});

    const reloaded = await ClearanceService.getById(opened._id.toString(), organizationId);
    expect(reloaded.items.some((entry) => entry.title === "Return laptop")).toBe(true);
  });

  it("allows only one active case per employee, and rejects a last day before the notice", async () => {
    const { organizationId, employeeId } = await seed("3");
    await ClearanceService.open({ organizationId, employeeId, ...OPEN }, {});

    await expect(ClearanceService.open({ organizationId, employeeId, ...OPEN }, {})).rejects.toThrow(ConflictError);

    const other = await seed("3b");
    await expect(ClearanceService.open({ organizationId: other.organizationId, employeeId: other.employeeId, ...OPEN, lastWorkingDay: "2026-09-01" }, {})).rejects.toThrow(
      BusinessRuleError,
    );
  });

  it("rejects an unknown separation type or an employee from another organization", async () => {
    const { organizationId, employeeId } = await seed("4");
    const other = await seed("4b");

    await expect(ClearanceService.open({ organizationId, employeeId, ...OPEN, separationTypeCode: "nope" }, {})).rejects.toThrow();
    await expect(ClearanceService.open({ organizationId, employeeId: other.employeeId, ...OPEN }, {})).rejects.toThrow(NotFoundError);
  });

  it("becomes cleared when every blocking item is resolved, and records who signed off", async () => {
    const { organizationId, employeeId, approverId } = await seed("5");
    const opened = await ClearanceService.open({ organizationId, employeeId, ...OPEN }, {});
    const laptop = opened.items.find((entry) => entry.title === "Return laptop")!;

    const updated = await ClearanceService.actOnItem(opened._id.toString(), organizationId, laptop._id.toString(), { action: "clear" }, { userId: approverId });

    expect(updated.status).toBe("cleared");
    const signed = updated.items.find((entry) => entry.title === "Return laptop")!;
    expect(signed.status).toBe("cleared");
    expect(signed.actedBy?.toString()).toBe(approverId);
    expect(signed.actedAt).toBeInstanceOf(Date);
    expect(await AuditLogModel.countDocuments({ resourceId: opened._id, action: "clearance.item-updated" })).toBe(1);
  });

  it("flags an item with an amount and reason, and requires a reason to flag or waive", async () => {
    const { organizationId, employeeId } = await seed("6");
    const opened = await ClearanceService.open({ organizationId, employeeId, ...OPEN }, {});
    const laptopId = opened.items.find((entry) => entry.title === "Return laptop")!._id.toString();

    await expect(ClearanceService.actOnItem(opened._id.toString(), organizationId, laptopId, { action: "waive" }, {})).rejects.toThrow(BusinessRuleError);
    await expect(ClearanceService.actOnItem(opened._id.toString(), organizationId, laptopId, { action: "flag", amount: 8500 }, {})).rejects.toThrow(BusinessRuleError);

    const flagged = await ClearanceService.actOnItem(opened._id.toString(), organizationId, laptopId, { action: "flag", amount: 8500, note: "Screen damaged" }, {});
    expect(flagged.items.find((entry) => entry.title === "Return laptop")).toMatchObject({ status: "flagged", amount: 8500, note: "Screen damaged" });
  });

  it("reopens a resolved item, putting the case back in clearance", async () => {
    const { organizationId, employeeId } = await seed("7");
    const opened = await ClearanceService.open({ organizationId, employeeId, ...OPEN }, {});
    const laptopId = opened.items.find((entry) => entry.title === "Return laptop")!._id.toString();
    await ClearanceService.actOnItem(opened._id.toString(), organizationId, laptopId, { action: "clear" }, {});

    const reopened = await ClearanceService.actOnItem(opened._id.toString(), organizationId, laptopId, { action: "reopen", note: "Charger still missing" }, {});

    expect(reopened.status).toBe("in_clearance");
    expect(reopened.items.find((entry) => entry.title === "Return laptop")?.status).toBe("pending");
  });

  it("won't let the departing employee sign off their own clearance", async () => {
    const { organizationId, employeeId, selfUserId } = await seed("8");
    const opened = await ClearanceService.open({ organizationId, employeeId, ...OPEN }, {});
    const laptopId = opened.items.find((entry) => entry.title === "Return laptop")!._id.toString();

    await expect(ClearanceService.actOnItem(opened._id.toString(), organizationId, laptopId, { action: "clear" }, { userId: selfUserId })).rejects.toThrow(AuthorizationError);
  });

  it("cancels a case with a reason (e.g. a withdrawn resignation) and freezes its items", async () => {
    const { organizationId, employeeId } = await seed("9");
    const opened = await ClearanceService.open({ organizationId, employeeId, ...OPEN }, {});

    await expect(ClearanceService.cancel(opened._id.toString(), organizationId, { reason: "" }, {})).rejects.toThrow(BusinessRuleError);
    const cancelled = await ClearanceService.cancel(opened._id.toString(), organizationId, { reason: "Resignation withdrawn" }, {});

    expect(cancelled.status).toBe("cancelled");
    const laptopId = cancelled.items.find((entry) => entry.title === "Return laptop")!._id.toString();
    await expect(ClearanceService.actOnItem(opened._id.toString(), organizationId, laptopId, { action: "clear" }, {})).rejects.toThrow(BusinessRuleError);
    // A cancelled case no longer blocks opening a new one.
    await expect(ClearanceService.open({ organizationId, employeeId, ...OPEN }, {})).resolves.toBeTruthy();
  });

  it("lists cases with the employee's name, newest first", async () => {
    const { organizationId, employeeId } = await seed("10");
    await ClearanceService.open({ organizationId, employeeId, ...OPEN }, {});

    const cases = await ClearanceService.listForOrganization(organizationId);

    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({ employeeName: "Ana Reyes", separationTypeName: "Resignation" });
  });
});
