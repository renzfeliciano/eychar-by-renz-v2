import { describe, it, expect, beforeEach } from "vitest";
import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, UserModel, AuditLogModel } from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";

describe("AuditService", () => {
  beforeEach(async () => {
    await connectMongoDB();
    await Promise.all([
      OrganizationModel.deleteMany({}),
      UserModel.deleteMany({}),
      AuditLogModel.deleteMany({}),
    ]);
  });

  it("records an append-only audit entry with before/after snapshots", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: "acme-audit" });
    const actor = await UserModel.create({ email: "actor@example.com", passwordHash: "hash" });
    const resourceId = new Types.ObjectId();

    await AuditService.record({
      organizationId: organization._id.toString(),
      actorUserId: actor._id.toString(),
      action: "organization.created",
      resourceType: "Organization",
      resourceId: resourceId.toString(),
      after: { name: "Acme" },
    });

    const entries = await AuditLogModel.find({ organizationId: organization._id }).lean();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: "organization.created",
      resourceType: "Organization",
    });
    expect(entries[0].after).toMatchObject({ name: "Acme" });
    expect(entries[0].timestamp).toBeInstanceOf(Date);
  });

  it("never exposes an update or delete API over audit entries", () => {
    expect((AuditService as Record<string, unknown>).update).toBeUndefined();
    expect((AuditService as Record<string, unknown>).delete).toBeUndefined();
  });
});
