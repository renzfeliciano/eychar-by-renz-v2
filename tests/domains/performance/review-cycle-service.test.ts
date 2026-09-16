import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel } from "@/server/db/models";
import { ReviewCycleService } from "@/domains/performance/review-cycle-service";

describe("ReviewCycleService", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("creates a review cycle in draft status", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-rc-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();

    const cycle = await ReviewCycleService.create(
      {
        organizationId: orgId,
        name: "2026 Annual Review",
        periodStart: new Date("2026-01-01"),
        periodEnd: new Date("2026-12-31"),
      },
      {},
    );

    expect(cycle.status).toBe("draft");
    expect(cycle.name).toBe("2026 Annual Review");
  });

  it("lists cycles for an organization, most recent first", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-rc-list-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();

    await ReviewCycleService.create(
      { organizationId: orgId, name: "Cycle A", periodStart: new Date("2025-01-01"), periodEnd: new Date("2025-12-31") },
      {},
    );
    await ReviewCycleService.create(
      { organizationId: orgId, name: "Cycle B", periodStart: new Date("2026-01-01"), periodEnd: new Date("2026-12-31") },
      {},
    );

    const cycles = await ReviewCycleService.listCurrent(orgId);
    expect(cycles.map((cycle) => cycle.name)).toEqual(["Cycle B", "Cycle A"]);
  });

  it("transitions status open -> closed and rejects an invalid transition", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-rc-status-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();

    const cycle = await ReviewCycleService.create(
      { organizationId: orgId, name: "Cycle", periodStart: new Date("2026-01-01"), periodEnd: new Date("2026-12-31") },
      {},
    );

    const opened = await ReviewCycleService.updateStatus(cycle._id.toString(), orgId, { status: "open" }, {});
    expect(opened.status).toBe("open");

    const closed = await ReviewCycleService.updateStatus(cycle._id.toString(), orgId, { status: "closed" }, {});
    expect(closed.status).toBe("closed");

    await expect(
      ReviewCycleService.updateStatus(cycle._id.toString(), orgId, { status: "open" }, {}),
    ).rejects.toThrow(/closed/i);
  });
});
