import { describe, it, expect, beforeEach } from "vitest";
import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { PerformanceEvaluationModel, PerformanceReviewModel, ReviewCycleModel, UserModel } from "@/server/db/models";
import { SuperAdminService } from "@/domains/authorization/super-admin-service";
import { DeletionService } from "@/domains/deletion/deletion-service";
import { ValidationError } from "@/shared/errors";
import { seedPayrollOrganization, seedEmployee } from "../payroll/fixtures";

async function seed() {
  const { organizationId } = await seedPayrollOrganization();
  const owner = await UserModel.create({ username: `owner.${Date.now()}.${Math.random()}`, passwordHash: "x" });
  await SuperAdminService.ensure(organizationId, owner._id.toString());
  const ana = await seedEmployee(organizationId, "Ana");
  const ben = await seedEmployee(organizationId, "Ben");
  const evaluation = await PerformanceEvaluationModel.create({
    organizationId: new Types.ObjectId(organizationId),
    employeeId: new Types.ObjectId(ana),
    evaluatorEmployeeId: new Types.ObjectId(ben),
    evaluationFor: "probationary",
    periodStart: new Date("2026-07-01"),
    periodEnd: new Date("2026-09-30"),
    templateVersion: 1,
  });
  return { organizationId, owner: owner._id.toString(), ana, ben, evaluationId: evaluation._id.toString() };
}

describe("deleting performance records", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("previews an evaluation under the employee's name, with nothing blocking it", async () => {
    const s = await seed();
    const preview = await DeletionService.preview("performance-evaluation", s.evaluationId, s.organizationId);
    expect(preview).toMatchObject({ label: "Ana Santos", noun: "performance evaluation", blockers: [] });
    expect(preview.summary).toEqual([{ label: "Performance evaluation", count: 1 }]);
  });

  it("needs the name typed, moves it to the recycle bin, and restores it exactly", async () => {
    const s = await seed();
    await expect(DeletionService.remove("performance-evaluation", s.evaluationId, s.organizationId, { confirm: "wrong" }, { userId: s.owner })).rejects.toThrow(ValidationError);
    expect(await PerformanceEvaluationModel.exists({ _id: s.evaluationId })).not.toBeNull();

    const batch = await DeletionService.remove("performance-evaluation", s.evaluationId, s.organizationId, { confirm: "Ana Santos" }, { userId: s.owner });
    expect(await PerformanceEvaluationModel.exists({ _id: s.evaluationId })).toBeNull();

    await DeletionService.restore(batch._id.toString(), s.organizationId, { userId: s.owner });
    const restored = await PerformanceEvaluationModel.findById(s.evaluationId).lean();
    expect(restored).toMatchObject({ evaluationFor: "probationary", status: "draft" });
  });

  it("takes an employee's evaluations with them when the employee is deleted", async () => {
    const s = await seed();
    const preview = await DeletionService.preview("employee", s.ana, s.organizationId);
    expect(preview.summary).toEqual(expect.arrayContaining([{ label: "Performance evaluations", count: 1 }]));

    await DeletionService.remove("employee", s.ana, s.organizationId, { confirm: "Ana Santos" }, { userId: s.owner });
    expect(await PerformanceEvaluationModel.exists({ _id: s.evaluationId })).toBeNull();
  });

  it("deletes an earlier single-rating review the same way", async () => {
    const s = await seed();
    const cycle = await ReviewCycleModel.create({ organizationId: new Types.ObjectId(s.organizationId), name: "H1", periodStart: new Date("2026-01-01"), periodEnd: new Date("2026-06-30") });
    const review = await PerformanceReviewModel.create({
      organizationId: new Types.ObjectId(s.organizationId),
      reviewCycleId: cycle._id,
      employeeId: new Types.ObjectId(s.ana),
      reviewerId: new Types.ObjectId(s.ben),
    });
    const batch = await DeletionService.remove("performance-review", review._id.toString(), s.organizationId, { confirm: "Ana Santos" }, { userId: s.owner });
    expect(await PerformanceReviewModel.exists({ _id: review._id })).toBeNull();
    await DeletionService.restore(batch._id.toString(), s.organizationId, { userId: s.owner });
    expect(await PerformanceReviewModel.exists({ _id: review._id })).not.toBeNull();
  });
});
