import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { AuditLogModel, EmploymentModel, OrganizationModel, PersonModel, EmployeeModel } from "@/server/db/models";
import { EmploymentService } from "@/domains/workforce/employment-service";
import { EmploymentTypeService } from "@/domains/catalog/employment-type-service";
import { EmploymentStatusService } from "@/domains/catalog/employment-status-service";
import { BusinessRuleError, NotFoundError } from "@/shared/errors";

async function seedEmployee(suffix: string) {
  const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-emt-${suffix}` });
  const person = await PersonModel.create({ organizationId: organization._id, firstName: "Jane", lastName: "Doe" });
  const employee = await EmployeeModel.create({
    organizationId: organization._id,
    personId: person._id,
    employeeNumber: `EMP-${suffix}`,
  });
  return { organization, employee };
}

describe("EmploymentService", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("hires an employee with an open, active employment stint", async () => {
    const { organization, employee } = await seedEmployee("1");

    const employment = await EmploymentService.create(
      { organizationId: organization._id.toString(), employeeId: employee._id.toString(), employmentType: "regular" },
      {},
    );

    expect(employment.status).toBe("active");
    const current = await EmploymentService.getCurrent(employee._id.toString());
    expect(current?._id.toString()).toBe(employment._id.toString());
  });

  it("rejects hiring the same employee twice while a stint is already open", async () => {
    const { organization, employee } = await seedEmployee("2");
    await EmploymentService.create(
      { organizationId: organization._id.toString(), employeeId: employee._id.toString(), employmentType: "regular" },
      {},
    );

    await expect(
      EmploymentService.create(
        { organizationId: organization._id.toString(), employeeId: employee._id.toString(), employmentType: "regular" },
        {},
      ),
    ).rejects.toThrow(BusinessRuleError);
  });

  it("terminates an open employment stint and allows a later rehire", async () => {
    const { organization, employee } = await seedEmployee("3");
    const firstStint = await EmploymentService.create(
      { organizationId: organization._id.toString(), employeeId: employee._id.toString(), employmentType: "regular" },
      {},
    );

    const terminated = await EmploymentService.terminate(
      firstStint._id.toString(),
      organization._id.toString(),
      { terminationReason: "resigned" },
      {},
    );
    expect(terminated.status).toBe("terminated");
    expect(await EmploymentService.getCurrent(employee._id.toString())).toBeNull();

    const rehireStint = await EmploymentService.create(
      { organizationId: organization._id.toString(), employeeId: employee._id.toString(), employmentType: "contractual" },
      {},
    );
    expect(rehireStint.status).toBe("active");
    expect((await EmploymentService.getCurrent(employee._id.toString()))?._id.toString()).toBe(rehireStint._id.toString());
  });

  it("rejects terminating an employment record from a different organization", async () => {
    const { employee } = await seedEmployee("4");
    const otherOrganization = await OrganizationModel.create({ name: "Other", slug: "other-emt-4" });
    const employment = await EmploymentService.create(
      { organizationId: (await EmployeeModel.findById(employee._id))!.organizationId.toString(), employeeId: employee._id.toString(), employmentType: "regular" },
      {},
    );

    await expect(
      EmploymentService.terminate(employment._id.toString(), otherOrganization._id.toString(), {}, {}),
    ).rejects.toThrow(NotFoundError);
  });

  it("rejects an employmentType that doesn't match the organization's configured catalog", async () => {
    const { organization, employee } = await seedEmployee("5");
    await EmploymentTypeService.create(
      { organizationId: organization._id.toString(), code: "regular", name: "Regular" },
      {},
    );

    await expect(
      EmploymentService.create(
        { organizationId: organization._id.toString(), employeeId: employee._id.toString(), employmentType: "made-up" },
        {},
      ),
    ).rejects.toThrow(BusinessRuleError);
  });

  it("isActiveStatus reads the configured catalog's isActiveHeadcount flag, and falls back to the literal rule when unconfigured", async () => {
    const { organization } = await seedEmployee("6");

    // Unconfigured: falls back to the original literal rule.
    expect(await EmploymentService.isActiveStatus(organization._id.toString(), "terminated")).toBe(false);
    expect(await EmploymentService.isActiveStatus(organization._id.toString(), "active")).toBe(true);

    // Configured: a custom terminal code ("resigned") is recognized via metadata.
    await EmploymentStatusService.create(
      {
        organizationId: organization._id.toString(),
        code: "resigned",
        name: "Resigned",
        metadata: { isActiveHeadcount: false },
      },
      {},
    );
    expect(await EmploymentService.isActiveStatus(organization._id.toString(), "resigned")).toBe(false);
  });

  it("terminate() accepts a caller-supplied status code once the catalog is configured", async () => {
    const { organization, employee } = await seedEmployee("7");
    await EmploymentStatusService.create(
      { organizationId: organization._id.toString(), code: "resigned", name: "Resigned" },
      {},
    );
    const stint = await EmploymentService.create(
      { organizationId: organization._id.toString(), employeeId: employee._id.toString(), employmentType: "regular" },
      {},
    );

    const terminated = await EmploymentService.terminate(stint._id.toString(), organization._id.toString(), { status: "resigned" }, {});

    expect(terminated.status).toBe("resigned");
  });

  describe("changeTerms (regularize, renew, change type)", () => {
    const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    async function seedProbationary() {
      const { organization, employee } = await seedEmployee(`terms-${unique()}`);
      const organizationId = organization._id.toString();
      await EmploymentTypeService.create({ organizationId, code: "regular", name: "Regular" }, {});
      await EmploymentTypeService.create({ organizationId, code: "probationary", name: "Probationary", metadata: { requiresEndOfContract: true, regularizeAfterMonths: 6 } }, {});
      await EmploymentTypeService.create({ organizationId, code: "contractual", name: "Contractual", metadata: { requiresEndOfContract: true } }, {});
      const employment = await EmploymentModel.create({
        organizationId: organization._id,
        employeeId: employee._id,
        employmentType: "probationary",
        status: "active",
        effectiveFrom: new Date("2026-05-01"),
        endOfContract: new Date("2026-11-01"),
      });
      return { organizationId, employeeId: employee._id.toString(), employment };
    }

    it("regularizes in place: same hire date, end date cleared, the change kept in history and audited", async () => {
      const { organizationId, employeeId, employment } = await seedProbationary();
      const userId = new EmployeeModel()._id.toString();

      const changed = await EmploymentService.changeTerms(employeeId, organizationId, { employmentType: "regular", effectiveFrom: new Date("2026-10-28"), note: "Passed the regularization evaluation" }, { userId });

      expect(changed._id.toString()).toBe(employment._id.toString());
      expect(changed.employmentType).toBe("regular");
      expect(changed.endOfContract).toBeUndefined();
      expect(changed.effectiveFrom.toISOString().slice(0, 10)).toBe("2026-05-01");
      expect(changed.termsHistory).toHaveLength(1);
      expect(changed.termsHistory[0]).toMatchObject({ employmentType: "regular", previousEmploymentType: "probationary", note: "Passed the regularization evaluation" });
      expect(changed.termsHistory[0].previousEndOfContract.toISOString().slice(0, 10)).toBe("2026-11-01");

      const audit = await AuditLogModel.findOne({ resourceId: employment._id, action: "employment.terms_changed" }).lean();
      expect(audit?.before).toMatchObject({ employmentType: "probationary" });
      expect(audit?.after).toMatchObject({ employmentType: "regular", endOfContract: null });
    });

    it("renews a contract with a new end date, and requires one for a type that ends", async () => {
      const { organizationId, employeeId } = await seedProbationary();

      await expect(EmploymentService.changeTerms(employeeId, organizationId, { employmentType: "contractual", effectiveFrom: new Date("2026-10-28") }, {})).rejects.toThrow(BusinessRuleError);

      const renewed = await EmploymentService.changeTerms(employeeId, organizationId, { employmentType: "contractual", effectiveFrom: new Date("2026-11-01"), endOfContract: new Date("2027-04-30") }, {});
      expect(renewed.endOfContract.toISOString().slice(0, 10)).toBe("2027-04-30");
    });

    it("refuses a change that changes nothing, takes effect before the hire date, or ends before it starts", async () => {
      const { organizationId, employeeId } = await seedProbationary();

      await expect(EmploymentService.changeTerms(employeeId, organizationId, { employmentType: "probationary", effectiveFrom: new Date("2026-10-28"), endOfContract: new Date("2026-11-01") }, {})).rejects.toThrow(/Nothing changed/);
      await expect(EmploymentService.changeTerms(employeeId, organizationId, { employmentType: "regular", effectiveFrom: new Date("2026-04-30") }, {})).rejects.toThrow(/before the employee was hired/);
      await expect(EmploymentService.changeTerms(employeeId, organizationId, { employmentType: "contractual", effectiveFrom: new Date("2026-11-01"), endOfContract: new Date("2026-10-01") }, {})).rejects.toThrow(/end before/);
      await expect(EmploymentService.changeTerms(employeeId, organizationId, { employmentType: "made-up", effectiveFrom: new Date("2026-10-28") }, {})).rejects.toThrow(BusinessRuleError);
    });

    it("refuses another organization's employee, and an employment that has ended", async () => {
      const { organizationId, employeeId, employment } = await seedProbationary();
      const other = await OrganizationModel.create({ name: "Other", slug: `other-terms-${unique()}` });

      await expect(EmploymentService.changeTerms(employeeId, other._id.toString(), { employmentType: "regular", effectiveFrom: new Date("2026-10-28") }, {})).rejects.toThrow(NotFoundError);

      await EmploymentModel.updateOne({ _id: employment._id }, { $set: { status: "terminated" } });
      await expect(EmploymentService.changeTerms(employeeId, organizationId, { employmentType: "regular", effectiveFrom: new Date("2026-10-28") }, {})).rejects.toThrow(/already ended/);
    });
  });
});
