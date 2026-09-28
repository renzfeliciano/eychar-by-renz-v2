import { describe, it, expect, beforeEach } from "vitest";
import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { AuditLogModel, OrganizationModel, PersonModel, UserModel } from "@/server/db/models";
import { AuditQueryService } from "@/server/audit/audit-query-service";

async function seed() {
  const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-audit-${Date.now()}-${Math.random()}` });
  const organizationId = organization._id;
  const person = await PersonModel.create({ organizationId, firstName: "Ana", lastName: "Reyes" });
  const actor = await UserModel.create({ username: `ana.audit.${Date.now()}.${Math.random()}`, passwordHash: "x", personId: person._id });
  const resourceId = new Types.ObjectId();
  const at = (iso: string) => new Date(iso);
  await AuditLogModel.create([
    { organizationId, actorUserId: actor._id, action: "auth.signed-in", resourceType: "User", resourceId: actor._id, timestamp: at("2026-09-28T01:00:00Z"), metadata: { ip: "203.0.113.7" } },
    { organizationId, actorUserId: actor._id, action: "payroll-run.approved", resourceType: "PayrollRun", resourceId, timestamp: at("2026-09-27T05:00:00Z") },
    { organizationId, actorUserId: actor._id, action: "leave-request.approved", resourceType: "LeaveRequest", resourceId, timestamp: at("2026-09-20T05:00:00Z") },
    { organizationId: new Types.ObjectId(), action: "auth.signed-in", resourceType: "User", resourceId, timestamp: at("2026-09-28T02:00:00Z") },
  ]);
  return { organizationId: organizationId.toString(), actorId: actor._id.toString() };
}

describe("AuditQueryService", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("lists the organization's entries newest first, with the actor's name", async () => {
    const { organizationId } = await seed();
    const page = await AuditQueryService.list(organizationId, {});
    expect(page.total).toBe(3);
    expect(page.rows.map((row) => row.action)).toEqual(["auth.signed-in", "payroll-run.approved", "leave-request.approved"]);
    expect(page.rows[0].actorName).toBe("Ana Reyes");
    expect(page.rows[0].metadata).toEqual({ ip: "203.0.113.7" });
  });

  it("filters by area (the action's prefix), resource type, actor and date range", async () => {
    const { organizationId, actorId } = await seed();
    expect((await AuditQueryService.list(organizationId, { area: "payroll-run" })).rows.map((row) => row.action)).toEqual(["payroll-run.approved"]);
    expect((await AuditQueryService.list(organizationId, { resourceType: "LeaveRequest" })).total).toBe(1);
    expect((await AuditQueryService.list(organizationId, { actorUserId: actorId })).total).toBe(3);
    expect((await AuditQueryService.list(organizationId, { from: "2026-09-27", to: "2026-09-27" })).rows.map((row) => row.action)).toEqual(["payroll-run.approved"]);
  });

  it("pages through results", async () => {
    const { organizationId } = await seed();
    const second = await AuditQueryService.list(organizationId, { page: 2, pageSize: 2 });
    expect(second.total).toBe(3);
    expect(second.rows.map((row) => row.action)).toEqual(["leave-request.approved"]);
  });

  it("counts entries by action and date range", async () => {
    const { organizationId } = await seed();
    expect(await AuditQueryService.count(organizationId, { actions: ["auth.signed-in"] })).toBe(1);
    expect(await AuditQueryService.count(organizationId, { actions: ["auth.signed-in", "payroll-run.approved"], from: "2026-09-27", to: "2026-09-28" })).toBe(2);
    expect(await AuditQueryService.count(organizationId, { from: "2026-09-20", to: "2026-09-20" })).toBe(1);
  });

  it("lists the areas that have entries, for the filter", async () => {
    const { organizationId } = await seed();
    expect(await AuditQueryService.areas(organizationId)).toEqual(["auth", "leave-request", "payroll-run"]);
  });
});
