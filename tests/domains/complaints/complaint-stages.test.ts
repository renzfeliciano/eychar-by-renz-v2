import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel } from "@/server/db/models";
import { CATALOG_REGISTRY, isCatalogTypeSlug } from "@/domains/catalog/catalog-registry";
import { ComplaintStageService } from "@/domains/catalog/complaint-stage-service";
import { DEFAULT_COMPLAINT_STAGES } from "@/domains/complaints/default-stages";

describe("the complaint-stages catalog", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("is a registered catalog with its own permission keys, so Settings and the catalog API pick it up", () => {
    expect(isCatalogTypeSlug("complaint-stages")).toBe(true);
    expect(CATALOG_REGISTRY["complaint-stages"].permissionPrefix).toBe("complaint-stages");
    expect(CATALOG_REGISTRY["complaint-stages"].service).toBe(ComplaintStageService);
  });

  it("starts with the four board columns HR asked for, in order, and only the last one closes a complaint", () => {
    expect(DEFAULT_COMPLAINT_STAGES.map((stage) => stage.name)).toEqual(["Received IR/complaint", "Set a date for NTE", "Administrative Hearing", "Sanction"]);
    expect(DEFAULT_COMPLAINT_STAGES.map((stage) => stage.code)).toEqual(["received", "nte_scheduled", "administrative_hearing", "sanction"]);
    expect(DEFAULT_COMPLAINT_STAGES.map((stage) => stage.sortOrder)).toEqual([0, 1, 2, 3]);
    expect(DEFAULT_COMPLAINT_STAGES.filter((stage) => stage.metadata?.isTerminal === true).map((stage) => stage.code)).toEqual(["sanction"]);
  });

  it("accepts a configured stage code and rejects an unknown one once a stage exists", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-cstage-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    await ComplaintStageService.create({ organizationId: orgId, code: "received", name: "Received IR/complaint", sortOrder: 0 }, {});

    await expect(ComplaintStageService.assertValidCode(orgId, "received")).resolves.not.toThrow();
    await expect(ComplaintStageService.assertValidCode(orgId, "not-a-stage")).rejects.toThrow();
  });
});
