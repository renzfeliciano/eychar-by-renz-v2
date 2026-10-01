import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { EmployeeModel, OrganizationModel, RoleAssignmentModel, UserModel } from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
import { SuperAdminService } from "@/domains/authorization/super-admin-service";
import { SESSION_IDLE_MS, SESSION_IDLE_WARNING_MS } from "@/lib/session-idle";
import { AuthorizationError, NotFoundError, ValidationError } from "@/shared/errors";

export type SecuritySettings = { idleTimeoutSeconds: number; idleWarningSeconds: number; requireTwoStepForStaff: boolean };

export type SecuritySettingsInput = { idleTimeoutSeconds: number; idleWarningSeconds: number; requireTwoStepForStaff?: boolean };

const DEFAULTS: SecuritySettings = { idleTimeoutSeconds: SESSION_IDLE_MS / 1000, idleWarningSeconds: SESSION_IDLE_WARNING_MS / 1000, requireTwoStepForStaff: false };

function read(security: Partial<SecuritySettings> | null | undefined): SecuritySettings {
  return {
    idleTimeoutSeconds: security?.idleTimeoutSeconds ?? DEFAULTS.idleTimeoutSeconds,
    idleWarningSeconds: security?.idleWarningSeconds ?? DEFAULTS.idleWarningSeconds,
    requireTwoStepForStaff: Boolean(security?.requireTwoStepForStaff),
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

  /**
   * Whether this account must set up two-step verification before using the
   * app: its organization requires it for staff, it's a staff account (no
   * linked employee), and two-step isn't on yet.
   */
  async mustSetUpTwoStep(userId: string): Promise<boolean> {
    await connectMongoDB();
    if (!Types.ObjectId.isValid(userId)) return false;
    const user = await UserModel.findById(userId).select("employeeId mfa.enabled").lean<{ employeeId?: unknown; mfa?: { enabled?: boolean } } | null>();
    if (!user || user.employeeId || user.mfa?.enabled) return false;
    return (await SecuritySettingsService.forUser(userId)).requireTwoStepForStaff;
  },

  /** Staff accounts in the organization that don't have two-step on yet (for the settings page). */
  async staffWithoutTwoStep(organizationId: string): Promise<number> {
    await connectMongoDB();
    const now = new Date();
    const userIds = await RoleAssignmentModel.find({
      organizationId: new Types.ObjectId(organizationId),
      effectiveFrom: { $lte: now },
      $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: null }, { effectiveTo: { $gte: now } }],
    }).distinct("userId");
    return UserModel.countDocuments({ _id: { $in: userIds }, status: "active", employeeId: { $exists: false }, "mfa.enabled": { $ne: true } });
  },

  async update(organizationId: string, input: SecuritySettingsInput, actor: { userId?: string }) {
    await connectMongoDB();
    if (!(await SuperAdminService.isSuperAdmin(actor.userId, organizationId))) throw new AuthorizationError("Only the Super Administrator can change security settings");
    const { idleTimeoutSeconds, idleWarningSeconds } = input;
    if (!Number.isInteger(idleTimeoutSeconds) || idleTimeoutSeconds < 30 || idleTimeoutSeconds > 86_400) throw new ValidationError("Idle limit must be between 30 seconds and 24 hours");
    if (!Number.isInteger(idleWarningSeconds) || idleWarningSeconds < 5) throw new ValidationError("The warning must be at least 5 seconds");
    if (idleWarningSeconds >= idleTimeoutSeconds) throw new ValidationError("The warning must start before the idle limit is reached");

    const organization = await OrganizationModel.findById(organizationId);
    if (!organization) throw new NotFoundError("Organization not found");
    const before = read(organization.security);
    const requireTwoStepForStaff = input.requireTwoStepForStaff ?? before.requireTwoStepForStaff;
    // Turning the requirement on while your own account lacks two-step would lock you out mid-session.
    if (requireTwoStepForStaff && !before.requireTwoStepForStaff) {
      const actorUser = await UserModel.findById(actor.userId).select("mfa.enabled").lean<{ mfa?: { enabled?: boolean } } | null>();
      if (!actorUser?.mfa?.enabled) throw new ValidationError("Turn on two-step verification for your own account first (Account › Security), then require it for everyone.");
    }
    organization.set("security", { idleTimeoutSeconds, idleWarningSeconds, requireTwoStepForStaff });
    await organization.save();

    await AuditService.record({ organizationId, actorUserId: actor.userId, action: "security-settings.updated", resourceType: "Organization", resourceId: organizationId, before, after: { idleTimeoutSeconds, idleWarningSeconds, requireTwoStepForStaff } });
    return read(organization.security);
  },
};
