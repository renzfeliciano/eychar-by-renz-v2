import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, PersonModel, EmployeeModel } from "@/server/db/models";
import { ReviewCycleService } from "@/domains/performance/review-cycle-service";
import { PerformanceReviewService } from "@/domains/performance/performance-review-service";
import { PerformanceRatingService } from "@/domains/catalog/performance-rating-service";

async function seedEmployee(organizationId: object, suffix: string) {
  const person = await PersonModel.create({ organizationId, firstName: `First${suffix}`, lastName: `Last${suffix}` });
  return EmployeeModel.create({ organizationId, personId: person._id, employeeNumber: `EMP-${suffix}-${Date.now()}-${Math.random()}` });
}

describe("PerformanceReviewService", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("creates a draft review for an employee within a cycle", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-pr-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    const cycle = await ReviewCycleService.create(
      { organizationId: orgId, name: "Cycle", periodStart: new Date("2026-01-01"), periodEnd: new Date("2026-12-31") },
      {},
    );
    const employee = await seedEmployee(organization._id, "EMP");
    const reviewer = await seedEmployee(organization._id, "MGR");

    const review = await PerformanceReviewService.create(
      {
        organizationId: orgId,
        reviewCycleId: cycle._id.toString(),
        employeeId: employee._id.toString(),
        reviewerId: reviewer._id.toString(),
      },
      {},
    );

    expect(review.status).toBe("draft");
  });

  it("rejects submitting without a rating, and accepts a configured rating code", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-pr-submit-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    const cycle = await ReviewCycleService.create(
      { organizationId: orgId, name: "Cycle", periodStart: new Date("2026-01-01"), periodEnd: new Date("2026-12-31") },
      {},
    );
    const employee = await seedEmployee(organization._id, "EMP2");
    const reviewer = await seedEmployee(organization._id, "MGR2");
    const review = await PerformanceReviewService.create(
      { organizationId: orgId, reviewCycleId: cycle._id.toString(), employeeId: employee._id.toString(), reviewerId: reviewer._id.toString() },
      {},
    );

    await expect(
      PerformanceReviewService.submit(review._id.toString(), orgId, { comments: "Great work" }, {}),
    ).rejects.toThrow(/rating/i);

    await PerformanceRatingService.create({ organizationId: orgId, code: "exceeds", name: "Exceeds Expectations", sortOrder: 3 }, {});

    const submitted = await PerformanceReviewService.submit(
      review._id.toString(),
      orgId,
      { ratingCode: "exceeds", comments: "Great work" },
      {},
    );
    expect(submitted.status).toBe("submitted");
    expect(submitted.ratingCode).toBe("exceeds");
  });

  it("rejects an unconfigured rating code once the org has configured its rating scale", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-pr-badrating-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    await PerformanceRatingService.create({ organizationId: orgId, code: "meets", name: "Meets Expectations", sortOrder: 2 }, {});
    const cycle = await ReviewCycleService.create(
      { organizationId: orgId, name: "Cycle", periodStart: new Date("2026-01-01"), periodEnd: new Date("2026-12-31") },
      {},
    );
    const employee = await seedEmployee(organization._id, "EMP3");
    const reviewer = await seedEmployee(organization._id, "MGR3");
    const review = await PerformanceReviewService.create(
      { organizationId: orgId, reviewCycleId: cycle._id.toString(), employeeId: employee._id.toString(), reviewerId: reviewer._id.toString() },
      {},
    );

    await expect(
      PerformanceReviewService.submit(review._id.toString(), orgId, { ratingCode: "not-a-real-code" }, {}),
    ).rejects.toThrow();
  });

  it("lists reviews for a cycle and for an employee", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-pr-list-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    const cycle = await ReviewCycleService.create(
      { organizationId: orgId, name: "Cycle", periodStart: new Date("2026-01-01"), periodEnd: new Date("2026-12-31") },
      {},
    );
    const employee = await seedEmployee(organization._id, "EMP4");
    const reviewer = await seedEmployee(organization._id, "MGR4");
    await PerformanceReviewService.create(
      { organizationId: orgId, reviewCycleId: cycle._id.toString(), employeeId: employee._id.toString(), reviewerId: reviewer._id.toString() },
      {},
    );

    const forCycle = await PerformanceReviewService.listForCycle(cycle._id.toString(), orgId);
    expect(forCycle).toHaveLength(1);

    const forEmployee = await PerformanceReviewService.listForEmployee(employee._id.toString(), orgId);
    expect(forEmployee).toHaveLength(1);
  });
});
