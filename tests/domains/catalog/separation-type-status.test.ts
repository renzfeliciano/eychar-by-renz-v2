import { describe, it, expect, beforeEach } from "vitest";
import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { AuditLogModel, OrganizationModel, SeparationTypeModel } from "@/server/db/models";
import { SeparationTypeService } from "@/domains/catalog/separation-type-service";
import { EmploymentStatusService } from "@/domains/catalog/employment-status-service";
import { employmentStatusForSeparation } from "@/domains/final-settlement/separation-status";

// ADR-062 settings (gaps B26): HR sets which employment status a separation type ends in.
const HR = { userId: new Types.ObjectId().toString() };

async function seed() {
  const organization = await OrganizationModel.create({ name: "Sep Co", slug: `sep-${Date.now()}-${Math.random()}` });
  const organizationId = organization._id.toString();
  await EmploymentStatusService.create({ organizationId, code: "resigned", name: "Resigned", metadata: { isActiveHeadcount: false } }, {});
  await EmploymentStatusService.create({ organizationId, code: "retired", name: "Retired", metadata: { isActiveHeadcount: false } }, {});
  const retirement = await SeparationTypeService.create({ organizationId, code: "retirement", name: "Retirement" }, {});
  const resignation = await SeparationTypeService.create({ organizationId, code: "resignation", name: "Resignation" }, {});
  return { organizationId, retirement: retirement._id.toString(), resignation: resignation._id.toString() };
}

describe("SeparationTypeService.setEmploymentStatus", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("maps a type with no default to a status, and audits it", async () => {
    const { organizationId, retirement } = await seed();
    expect(employmentStatusForSeparation(await SeparationTypeModel.findById(retirement).lean())).toBeNull();

    await SeparationTypeService.setEmploymentStatus(retirement, organizationId, "retired", HR);
    expect(employmentStatusForSeparation(await SeparationTypeModel.findById(retirement).lean())).toBe("retired");
    const audit = await AuditLogModel.findOne({ resourceId: retirement, action: "separation-type.employment-status-set" }).lean();
    expect(audit?.after).toMatchObject({ employmentStatusCode: "retired" });
  });

  it("can turn a default off explicitly, and refuses a status the organization doesn't have", async () => {
    const { organizationId, resignation } = await seed();
    expect(employmentStatusForSeparation(await SeparationTypeModel.findById(resignation).lean())).toBe("resigned");

    await SeparationTypeService.setEmploymentStatus(resignation, organizationId, null, HR);
    expect(employmentStatusForSeparation(await SeparationTypeModel.findById(resignation).lean())).toBeNull();
    await expect(SeparationTypeService.setEmploymentStatus(resignation, organizationId, "vanished", HR)).rejects.toThrow();
  });
});
