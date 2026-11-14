import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { isDuplicateKeyError } from "@/server/db/mongo-errors";
import { ComplaintModel, DeletedRecordModel, EmployeeModel, ProjectModel } from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
import { ComplaintStageService } from "@/domains/catalog/complaint-stage-service";
import { BusinessRuleError, NotFoundError } from "@/shared/errors";
import type { CreateComplaintInput, UpdateComplaintInput } from "@/shared/validation/complaint";
import { hasSectionData, parseStageDetails, type StageDetails } from "./stage-sections";

const IR_PREFIX = "IR-";
// Two people adding a complaint at the same moment can compute the same number; the unique
// index lets only one win, and the loser recomputes. A few tries covers any realistic burst.
const IR_NUMBER_ATTEMPTS = 5;

async function assertRespondentValid(organizationId: string, employeeId: string) {
  const exists = await EmployeeModel.exists({ _id: new Types.ObjectId(employeeId), organizationId: new Types.ObjectId(organizationId) });
  if (!exists) throw new NotFoundError("Employee not found in this organization");
}

async function assertProjectValid(organizationId: string, projectId: string) {
  const exists = await ProjectModel.exists({ _id: new Types.ObjectId(projectId), organizationId: new Types.ObjectId(organizationId) });
  if (!exists) throw new NotFoundError("Project not found in this organization");
}

/** The lowest-sorted active stage: where a new complaint starts. Read from the catalog, never hard-coded. */
async function firstActiveStage(organizationId: string): Promise<string> {
  const stages = await ComplaintStageService.listCurrent(organizationId);
  const first = stages.find((stage) => stage.status === "active");
  if (!first) throw new BusinessRuleError("No active complaint stage. Add one under Settings > Catalogs.");
  return first.code;
}

/**
 * Next IR number for the organization. Hidden test complaints count, and so do complaints in the
 * recycle bin: reusing a deleted complaint's number would make restoring it fail on the unique index.
 */
async function nextIrNumber(organizationId: string): Promise<string> {
  const orgObjectId = new Types.ObjectId(organizationId);
  const [live, deleted] = await Promise.all([
    ComplaintModel.find({ organizationId: orgObjectId }, { irNumber: 1 }, { includeHidden: true }).lean<{ irNumber: string }[]>(),
    DeletedRecordModel.find({ organizationId: orgObjectId, collectionName: ComplaintModel.collection.collectionName }, { "doc.irNumber": 1 }).lean<{ doc?: { irNumber?: string } }[]>(),
  ]);
  const numbers = [...live.map((row) => row.irNumber), ...deleted.map((row) => row.doc?.irNumber)];
  const highest = numbers.reduce((max, irNumber) => {
    const value = Number.parseInt((irNumber ?? "").slice(IR_PREFIX.length), 10);
    return Number.isFinite(value) && value > max ? value : max;
  }, 0);
  return `${IR_PREFIX}${String(highest + 1).padStart(4, "0")}`;
}

// The incident details HR can fill in on the first card; all optional, so a blank clears the field.
const INCIDENT_TEXT_FIELDS = ["description", "what", "where", "complainantName", "remarks"] as const;
type IncidentInput = Partial<Record<(typeof INCIDENT_TEXT_FIELDS)[number], string | null>> & { incidentDate?: Date | null; projectId?: string | null };

const blankToUndefined = (value: string | null | undefined) => (value && value.trim() ? value.trim() : undefined);

/** The incident fields of an input, with blanks as undefined (which unsets the field on save). */
function incidentValues(input: IncidentInput) {
  return {
    ...Object.fromEntries(INCIDENT_TEXT_FIELDS.map((field) => [field, blankToUndefined(input[field])])),
    incidentDate: input.incidentDate ?? undefined,
    projectId: input.projectId ? new Types.ObjectId(input.projectId) : undefined,
  } as Record<(typeof INCIDENT_TEXT_FIELDS)[number], string | undefined> & { incidentDate: Date | undefined; projectId: Types.ObjectId | undefined };
}

type SnapshotSource = { employeeId: Types.ObjectId; receivedDate: Date; incidentDate?: Date | null; projectId?: Types.ObjectId | null } & Partial<Record<(typeof INCIDENT_TEXT_FIELDS)[number], string | null>>;

const snapshot = (complaint: SnapshotSource) => ({
  employeeId: complaint.employeeId,
  receivedDate: complaint.receivedDate,
  incidentDate: complaint.incidentDate,
  projectId: complaint.projectId,
  ...Object.fromEntries(INCIDENT_TEXT_FIELDS.map((field) => [field, complaint[field]])),
});

type StageDetailsMap = Record<string, StageDetails>;

/** Replaces one stage's section on a complaint document; an empty section removes the key. Marks the path modified. */
function applySection(complaint: { stageDetails?: unknown; markModified: (path: string) => void; set: (path: string, value: unknown) => void }, stage: string, section: StageDetails) {
  const all: StageDetailsMap = { ...((complaint.stageDetails as StageDetailsMap | undefined) ?? {}) };
  if (hasSectionData(section)) all[stage] = section;
  else delete all[stage];
  complaint.set("stageDetails", Object.keys(all).length > 0 ? all : undefined);
  complaint.markModified("stageDetails");
}

export const ComplaintService = {
  async create(input: CreateComplaintInput, actor: { userId?: string }) {
    await connectMongoDB();
    await assertRespondentValid(input.organizationId, input.employeeId);
    if (input.projectId) await assertProjectValid(input.organizationId, input.projectId);
    const stage = await firstActiveStage(input.organizationId);

    let complaint;
    for (let attempt = 1; ; attempt += 1) {
      try {
        complaint = await ComplaintModel.create({
          organizationId: new Types.ObjectId(input.organizationId),
          employeeId: new Types.ObjectId(input.employeeId),
          irNumber: await nextIrNumber(input.organizationId),
          receivedDate: input.receivedDate,
          ...incidentValues(input),
          stage,
        });
        break;
      } catch (error) {
        if (!isDuplicateKeyError(error) || attempt >= IR_NUMBER_ATTEMPTS) throw error;
      }
    }

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "complaint.created",
      resourceType: "Complaint",
      resourceId: complaint._id.toString(),
      after: { irNumber: complaint.irNumber, employeeId: complaint.employeeId, stage: complaint.stage },
    });

    return complaint;
  },

  /** A full edit of respondent, date received and remarks. The IR number and the stage never change here. */
  async update(id: string, organizationId: string, patch: Omit<UpdateComplaintInput, "organizationId">, actor: { userId?: string }) {
    await connectMongoDB();

    const complaint = await ComplaintModel.findOne({ _id: new Types.ObjectId(id), organizationId: new Types.ObjectId(organizationId) });
    if (!complaint) throw new NotFoundError("Complaint not found in this organization");

    // Only a new respondent is checked: a complaint about someone whose record was later deleted or
    // hidden must stay editable (date, remarks) without being re-pointed at another person.
    if (patch.employeeId !== complaint.employeeId.toString()) await assertRespondentValid(organizationId, patch.employeeId);
    // Likewise the project: only a newly chosen one is checked, so a complaint whose project was later deleted stays editable.
    if (patch.projectId && patch.projectId !== complaint.projectId?.toString()) await assertProjectValid(organizationId, patch.projectId);

    const before = snapshot(complaint);
    complaint.employeeId = new Types.ObjectId(patch.employeeId);
    complaint.receivedDate = patch.receivedDate;
    for (const [field, value] of Object.entries(incidentValues(patch))) complaint.set(field, value);
    await complaint.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "complaint.updated",
      resourceType: "Complaint",
      resourceId: complaint._id.toString(),
      before,
      after: snapshot(complaint),
    });

    return complaint;
  },

  /**
   * Free-form move to any configured stage, in any direction (drag-and-drop or the "Move to" select).
   * `details` is that stage's section, validated and saved in the same step as the move.
   */
  async moveStage(id: string, organizationId: string, patch: { stage: string; details?: unknown }, actor: { userId?: string }) {
    await connectMongoDB();

    const complaint = await ComplaintModel.findOne({ _id: new Types.ObjectId(id), organizationId: new Types.ObjectId(organizationId) });
    if (!complaint) throw new NotFoundError("Complaint not found in this organization");

    await ComplaintStageService.assertValidCode(organizationId, patch.stage);
    const section = patch.details === undefined ? undefined : parseStageDetails(patch.stage, patch.details);

    const before = { stage: complaint.stage };
    complaint.stage = patch.stage;
    if (section) applySection(complaint, patch.stage, section);
    await complaint.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "complaint.stage_moved",
      resourceType: "Complaint",
      resourceId: complaint._id.toString(),
      before,
      after: { stage: complaint.stage, ...(section ? { details: section } : {}) },
    });

    return complaint;
  },

  /** Saves one stage's details section (replacing it whole), from the side panel. Any catalog stage, active or not. */
  async saveStageDetails(id: string, organizationId: string, patch: { stage: string; details: unknown }, actor: { userId?: string }) {
    await connectMongoDB();

    const complaint = await ComplaintModel.findOne({ _id: new Types.ObjectId(id), organizationId: new Types.ObjectId(organizationId) });
    if (!complaint) throw new NotFoundError("Complaint not found in this organization");

    // Any stage in the catalog, active or not: details already recorded for a retired stage stay editable.
    if (!(await ComplaintStageService.getByCode(organizationId, patch.stage))) {
      throw new BusinessRuleError(`"${patch.stage}" is not a ComplaintStage value for this organization`);
    }
    const section = parseStageDetails(patch.stage, patch.details);

    const before = ((complaint.stageDetails as StageDetailsMap | undefined) ?? {})[patch.stage] ?? {};
    applySection(complaint, patch.stage, section);
    await complaint.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "complaint.stage_details_updated",
      resourceType: "Complaint",
      resourceId: complaint._id.toString(),
      before,
      after: section,
    });

    return complaint;
  },

  async listForOrganization(organizationId: string, filters: { stage?: string } = {}) {
    await connectMongoDB();
    const filter: Record<string, unknown> = { organizationId: new Types.ObjectId(organizationId) };
    if (filters.stage) filter.stage = filters.stage;
    return ComplaintModel.find(filter).sort({ receivedDate: -1, irNumber: -1 }).lean();
  },
};
