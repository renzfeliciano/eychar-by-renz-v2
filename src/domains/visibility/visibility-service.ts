import { Types, type Model } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import * as models from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
import { SuperAdminService } from "@/domains/authorization/super-admin-service";
import { AuthorizationError, NotFoundError, ValidationError } from "@/shared/errors";

// Record types the Super Administrator can hide as test data (ADR-034).
// Staff accounts use the same flag, filtered in the account lists rather than by the
// query plugin, since sign-in itself reads accounts.
const HIDEABLE = {
  employee: models.EmployeeModel,
  project: models.ProjectModel,
  location: models.LocationModel,
  position: models.PositionModel,
  "organization-unit": models.OrganizationUnitModel,
  "leave-type": models.LeaveTypeModel,
  "shift-template": models.ShiftTemplateModel,
  "travel-order": models.TravelOrderModel,
  case: models.CaseModel,
  event: models.EventModel,
  applicant: models.ApplicantModel,
  clearance: models.ClearanceCaseModel,
  "final-settlement": models.FinalSettlementModel,
  "staff-account": models.UserModel,
} as Record<string, Model<any>>; // eslint-disable-line @typescript-eslint/no-explicit-any

export type HideableType = keyof typeof HIDEABLE;

export const VisibilityService = {
  hideableTypes(): string[] {
    return Object.keys(HIDEABLE);
  },

  isHideable(type: string): boolean {
    return type in HIDEABLE;
  },

  /** Hides (or unhides) one record from everyone but the Super Administrator. */
  async setHidden(type: string, id: string, organizationId: string, hidden: boolean, actor: { userId?: string }) {
    await connectMongoDB();
    if (!(await SuperAdminService.isSuperAdmin(actor.userId, organizationId))) throw new AuthorizationError("Only the Super Administrator can hide or unhide records");
    const model = HIDEABLE[type];
    if (!model) throw new ValidationError("This kind of record can't be hidden");
    if (!Types.ObjectId.isValid(id)) throw new NotFoundError("Record not found in this organization");
    // Straight to the collection: a hidden record must stay reachable here.
    const filter = type === "staff-account" ? { _id: new Types.ObjectId(id) } : { _id: new Types.ObjectId(id), organizationId: new Types.ObjectId(organizationId) };
    if (type === "staff-account" && actor.userId === id) throw new ValidationError("You can't hide your own account");
    const result = await model.collection.updateOne(filter, { $set: { hiddenFromOthers: hidden } });
    if (!result.matchedCount) throw new NotFoundError("Record not found in this organization");

    await AuditService.record({ organizationId, actorUserId: actor.userId, action: hidden ? "record.hidden" : "record.unhidden", resourceType: type, resourceId: id });
    return { hidden };
  },
};
