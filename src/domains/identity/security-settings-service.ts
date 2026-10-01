import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { EmployeeModel, OrganizationModel, RoleAssignmentModel, UserModel } from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
import { SuperAdminService } from "@/domains/authorization/super-admin-service";
import { SESSION_IDLE_MS, SESSION_IDLE_WARNING_MS } from "@/lib/session-idle";
import { AuthorizationError, NotFoundError, ValidationError } from "@/shared/errors";

export type SecuritySettings = { idleTimeoutSeconds: number; idleWarningSeconds: number };

const DEFAULTS: SecuritySettings = { idleTimeoutSeconds: SESSION_IDLE_MS / 1000, idleWarningSeconds: SESSION_IDLE_WARNING_MS / 1000 };

function read(security: Partial<SecuritySettings> | null | undefined): SecuritySettings {
  return {
    idleTimeoutSeconds: security?.idleTimeoutSeconds ?? DEFAULTS.idleTimeoutSeconds,
    idleWarningSeconds: security?.idleWarningSeconds ?? DEFAULTS.idleWarningSeconds,
  };
}

/** The organization's session rules (Settings › Security), changed only by the Super Administrator. */
export const SecuritySettingsService = {
  async get(organizationId: string): Promise<SecuritySettings> {
    await connectMongoDB();
    const organization = Types.ObjectId.isValid(organizationId) ? await OrganizationModel.findById(organizationId).select("security").lean() : null;
    return read(organization?.security);
  },

  /** The rules that apply to a signed-in account: its employee's organization, or the one it holds a role in. */
  async forUser(userId: string): Promise<SecuritySettings> {
    await connectMongoDB();
    if (!Types.ObjectId.isValid(userId)) return DEFAULTS;
    const user = await UserModel.findById(userId).select("employeeId").lean();
    const organizationId = user?.employeeId
      ? (await EmployeeModel.findById(user.employeeId).select("organizationId").lean())?.organizationId
      : (await RoleAssignmentModel.findOne({ userId: new Types.ObjectId(userId) }).select("organizationId").lean())?.organizationId;
    return organizationId ? SecuritySettingsService.get(organizationId.toString()) : DEFAULTS;
  },

  async update(organizationId: string, input: SecuritySettings, actor: { userId?: string }) {
    await connectMongoDB();
    if (!(await SuperAdminService.isSuperAdmin(actor.userId, organizationId))) throw new AuthorizationError("Only the Super Administrator can change security settings");
    const { idleTimeoutSeconds, idleWarningSeconds } = input;
    if (!Number.isInteger(idleTimeoutSeconds) || idleTimeoutSeconds < 30 || idleTimeoutSeconds > 86_400) throw new ValidationError("Idle limit must be between 30 seconds and 24 hours");
    if (!Number.isInteger(idleWarningSeconds) || idleWarningSeconds < 5) throw new ValidationError("The warning must be at least 5 seconds");
    if (idleWarningSeconds >= idleTimeoutSeconds) throw new ValidationError("The warning must start before the idle limit is reached");

    const organization = await OrganizationModel.findById(organizationId);
    if (!organization) throw new NotFoundError("Organization not found");
    const before = read(organization.security);
    organization.set("security", { idleTimeoutSeconds, idleWarningSeconds });
    await organization.save();

    await AuditService.record({ organizationId, actorUserId: actor.userId, action: "security-settings.updated", resourceType: "Organization", resourceId: organizationId, before, after: { idleTimeoutSeconds, idleWarningSeconds } });
    return read(organization.security);
  },
};
