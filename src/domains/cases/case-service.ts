import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { CaseModel, ProjectModel } from "@/server/db/models";
import { CaseClassificationService } from "@/domains/catalog/case-classification-service";
import { CaseStatusService } from "@/domains/catalog/case-status-service";
import { AuditService } from "@/server/audit/audit-service";
import { NotFoundError } from "@/shared/errors";
import type { CreateCaseInput, UpdateCaseInput } from "@/shared/validation/cases";

async function assertReferencesValid(input: { organizationId: string; projectId: string; classification: string; status: string }) {
  const projectExists = await ProjectModel.exists({
    _id: new Types.ObjectId(input.projectId),
    organizationId: new Types.ObjectId(input.organizationId),
  });
  if (!projectExists) throw new NotFoundError("Project not found in this organization");

  await CaseClassificationService.assertValidCode(input.organizationId, input.classification);
  await CaseStatusService.assertValidCode(input.organizationId, input.status);
}

export const CaseService = {
  async create(input: CreateCaseInput, actor: { userId?: string }) {
    await connectMongoDB();
    await assertReferencesValid(input);

    const caseRecord = await CaseModel.create({
      organizationId: new Types.ObjectId(input.organizationId),
      projectId: new Types.ObjectId(input.projectId),
      caseName: input.caseName,
      caseNumber: input.caseNumber,
      classification: input.classification,
      status: input.status,
      legalCounsel: input.legalCounsel,
      briefHistory: input.briefHistory,
    });

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "case.created",
      resourceType: "Case",
      resourceId: caseRecord._id.toString(),
      after: { caseName: caseRecord.caseName, caseNumber: caseRecord.caseNumber, classification: caseRecord.classification, status: caseRecord.status },
    });

    return caseRecord;
  },

  /** A full edit — same shape as create, mirroring the legacy app's single reused form. */
  async update(id: string, organizationId: string, patch: Omit<UpdateCaseInput, "organizationId">, actor: { userId?: string }) {
    await connectMongoDB();

    const caseRecord = await CaseModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!caseRecord) throw new NotFoundError("Case not found in this organization");

    await assertReferencesValid({ organizationId, ...patch });

    const before = { classification: caseRecord.classification, status: caseRecord.status };
    caseRecord.projectId = new Types.ObjectId(patch.projectId);
    caseRecord.caseName = patch.caseName;
    caseRecord.caseNumber = patch.caseNumber;
    caseRecord.classification = patch.classification;
    caseRecord.status = patch.status;
    caseRecord.legalCounsel = patch.legalCounsel;
    caseRecord.briefHistory = patch.briefHistory;
    await caseRecord.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "case.updated",
      resourceType: "Case",
      resourceId: caseRecord._id.toString(),
      before,
      after: { classification: caseRecord.classification, status: caseRecord.status },
    });

    return caseRecord;
  },

  async listCurrent(organizationId: string) {
    await connectMongoDB();
    return CaseModel.find({ organizationId: new Types.ObjectId(organizationId) }).sort({ createdAt: -1 }).lean();
  },

  async getById(id: string, organizationId: string) {
    await connectMongoDB();
    const caseRecord = await CaseModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
    }).lean();
    if (!caseRecord) throw new NotFoundError("Case not found in this organization");
    return caseRecord;
  },
};
