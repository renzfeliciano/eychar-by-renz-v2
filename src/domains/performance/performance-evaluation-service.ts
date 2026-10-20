import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { EmployeeAssignmentModel, EmployeeModel, PerformanceEvaluationModel, PersonModel, PositionModel, ProjectModel } from "@/server/db/models";
import { EvaluationTypeService } from "@/domains/catalog/evaluation-type-service";
import { AuditService } from "@/server/audit/audit-service";
import { AuthorizationError, BusinessRuleError, NotFoundError } from "@/shared/errors";
import { formatPersonName } from "@/lib/person-name";
import type {
  AcknowledgePerformanceEvaluationInput,
  CreatePerformanceEvaluationInput,
  SavePerformanceEvaluationInput,
  SubmitPerformanceEvaluationInput,
} from "@/shared/validation/performance-evaluation";
import { CURRENT_TEMPLATE_VERSION, criterionKeys, getTemplate } from "./evaluation-template";
import { resolveEvaluators } from "./evaluator-resolver";
import type { EvaluationActor } from "./evaluation-actor";

type EvaluationDoc = InstanceType<typeof PerformanceEvaluationModel>;

export type EmployeeCard = { name: string; jobTitle?: string; projectName?: string };

/** The employee's name, current position and project, read from the live records. */
async function describeEmployee(employeeId: Types.ObjectId | string, organizationId: Types.ObjectId, now = new Date()): Promise<EmployeeCard> {
  const employee = await EmployeeModel.findOne({ _id: employeeId, organizationId }).lean();
  const [person, assignment] = await Promise.all([
    employee ? PersonModel.findById(employee.personId).lean() : null,
    EmployeeAssignmentModel.findOne({
      organizationId,
      employeeId,
      status: "active",
      effectiveFrom: { $lte: now },
      $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: null }, { effectiveTo: { $gt: now } }],
    })
      .sort({ effectiveFrom: -1 })
      .lean(),
  ]);
  const [position, project] = await Promise.all([
    assignment?.positionId ? PositionModel.findById(assignment.positionId).lean() : null,
    assignment?.projectId ? ProjectModel.findById(assignment.projectId).lean() : null,
  ]);
  return { name: formatPersonName(person), jobTitle: position?.title, projectName: project?.name };
}

function assertCanAct(evaluation: { evaluatorEmployeeId: Types.ObjectId }, actor: EvaluationActor) {
  if (actor.canManage) return;
  if (actor.employeeId && evaluation.evaluatorEmployeeId.equals(actor.employeeId)) return;
  throw new AuthorizationError("Only the assigned evaluator, or HR oversight, can do this");
}

async function load(id: string, organizationId: string): Promise<EvaluationDoc> {
  await connectMongoDB();
  if (!Types.ObjectId.isValid(id)) throw new NotFoundError("Performance evaluation not found in this organization");
  const evaluation = await PerformanceEvaluationModel.findOne({ _id: new Types.ObjectId(id), organizationId: new Types.ObjectId(organizationId) });
  if (!evaluation) throw new NotFoundError("Performance evaluation not found in this organization");
  return evaluation;
}

function assertPeriod(start: Date, end: Date) {
  if (end.getTime() < start.getTime()) throw new BusinessRuleError("The period must end on or after it starts");
}

export const PerformanceEvaluationService = {
  /**
   * Starts a draft. The evaluator must be someone the evaluator rules allow
   * for this employee, and the caller must be that evaluator; HR oversight can
   * start one for anyone and name any evaluator (recorded as an override).
   */
  async create(input: CreatePerformanceEvaluationInput, actor: EvaluationActor) {
    await connectMongoDB();
    const organizationId = new Types.ObjectId(input.organizationId);

    if (input.employeeId === input.evaluatorId) throw new BusinessRuleError("An employee cannot evaluate themselves");
    const [employee, evaluator] = await Promise.all([
      EmployeeModel.exists({ _id: new Types.ObjectId(input.employeeId), organizationId }),
      EmployeeModel.exists({ _id: new Types.ObjectId(input.evaluatorId), organizationId }),
    ]);
    if (!employee) throw new NotFoundError("Employee not found in this organization");
    if (!evaluator) throw new NotFoundError("Evaluator not found in this organization");

    await EvaluationTypeService.assertValidCode(input.organizationId, input.evaluationFor);
    assertPeriod(input.periodStart, input.periodEnd);

    if (!actor.canManage && actor.employeeId !== input.evaluatorId) {
      throw new AuthorizationError("You can only start an evaluation as its evaluator");
    }
    const { candidates } = await resolveEvaluators(input.employeeId, input.organizationId);
    const matchesRule = candidates.some((candidate) => candidate.employeeId === input.evaluatorId);
    if (!matchesRule && !actor.canManage) {
      throw new BusinessRuleError("That person is not an authorized evaluator for this employee");
    }

    const evaluation = await PerformanceEvaluationModel.create({
      organizationId,
      employeeId: new Types.ObjectId(input.employeeId),
      evaluatorEmployeeId: new Types.ObjectId(input.evaluatorId),
      evaluationFor: input.evaluationFor,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      templateVersion: CURRENT_TEMPLATE_VERSION,
      evaluatorOverride: !matchesRule,
    });

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "performance-evaluation.created",
      resourceType: "PerformanceEvaluation",
      resourceId: evaluation._id.toString(),
      after: { employeeId: input.employeeId, evaluatorId: input.evaluatorId, evaluationFor: input.evaluationFor },
      metadata: matchesRule ? undefined : { evaluatorRuleOverride: true },
    });
    return evaluation;
  },

  /** Saves the draft form: header, ratings, goals and comments. Only while still a draft. */
  async saveDraft(id: string, organizationId: string, patch: SavePerformanceEvaluationInput, actor: EvaluationActor) {
    const evaluation = await load(id, organizationId);
    assertCanAct(evaluation, actor);
    if (evaluation.status !== "draft") throw new BusinessRuleError("A submitted evaluation can no longer be edited");

    if (patch.evaluationFor !== undefined) {
      await EvaluationTypeService.assertValidCode(organizationId, patch.evaluationFor);
      evaluation.evaluationFor = patch.evaluationFor;
    }
    const start = patch.periodStart ?? evaluation.periodStart;
    const end = patch.periodEnd ?? evaluation.periodEnd;
    assertPeriod(start, end);
    evaluation.periodStart = start;
    evaluation.periodEnd = end;

    if (patch.ratings) {
      const valid = new Set(criterionKeys(getTemplate(evaluation.templateVersion)));
      const byKey = new Map<string, "S" | "A" | "NI">();
      for (const { criterionKey, rating } of patch.ratings) {
        if (!valid.has(criterionKey)) throw new BusinessRuleError(`Unknown criterion "${criterionKey}"`);
        byKey.set(criterionKey, rating);
      }
      evaluation.ratings = [...byKey].map(([criterionKey, rating]) => ({ criterionKey, rating }));
    }
    if (patch.goals !== undefined) evaluation.goals = patch.goals;
    if (patch.evaluatorComments !== undefined) evaluation.evaluatorComments = patch.evaluatorComments;
    await evaluation.save();
    return evaluation;
  },

  /** Locks the form with the evaluator's typed acknowledgment. Every criterion must be rated. */
  async submit(id: string, organizationId: string, input: SubmitPerformanceEvaluationInput, actor: EvaluationActor) {
    const evaluation = await load(id, organizationId);
    assertCanAct(evaluation, actor);
    if (evaluation.status !== "draft") throw new BusinessRuleError(`Only a draft can be submitted (current status: ${evaluation.status})`);

    const rated = new Set(evaluation.ratings.map((entry: { criterionKey: string }) => entry.criterionKey));
    const missing = criterionKeys(getTemplate(evaluation.templateVersion)).filter((key) => !rated.has(key));
    if (missing.length > 0) throw new BusinessRuleError(`Rate every criterion before submitting (${missing.length} not rated)`);

    const orgId = new Types.ObjectId(organizationId);
    const [employeeCard, evaluatorCard, evaluationType] = await Promise.all([
      describeEmployee(evaluation.employeeId, orgId),
      describeEmployee(evaluation.evaluatorEmployeeId, orgId),
      EvaluationTypeService.getByCode(organizationId, evaluation.evaluationFor),
    ]);
    const now = new Date();
    evaluation.snapshot = {
      employeeName: employeeCard.name,
      evaluatorName: evaluatorCard.name,
      jobTitle: employeeCard.jobTitle,
      projectName: employeeCard.projectName,
      evaluationForName: evaluationType?.name ?? evaluation.evaluationFor,
    };
    evaluation.status = "submitted";
    evaluation.submittedAt = now;
    evaluation.evaluatorAcknowledgment = { typedName: input.typedName, at: now, byUserId: new Types.ObjectId(actor.userId) };
    await evaluation.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "performance-evaluation.submitted",
      resourceType: "PerformanceEvaluation",
      resourceId: evaluation._id.toString(),
      before: { status: "draft" },
      after: { status: "submitted" },
      metadata: actor.employeeId === evaluation.evaluatorEmployeeId.toString() ? undefined : { onBehalfOfEvaluator: true },
    });
    return evaluation;
  },

  /**
   * Records the employee's typed acknowledgment and any comments or written
   * explanation. It confirms receipt and discussion, not agreement. Entered by
   * the evaluator (or HR) at the discussion; the user who recorded it is kept.
   */
  async acknowledge(id: string, organizationId: string, input: AcknowledgePerformanceEvaluationInput, actor: EvaluationActor) {
    const evaluation = await load(id, organizationId);
    assertCanAct(evaluation, actor);
    if (evaluation.status !== "submitted") {
      throw new BusinessRuleError(evaluation.status === "draft" ? "Submit the evaluation before the employee acknowledges it" : "This evaluation has already been acknowledged");
    }
    evaluation.employeeAcknowledgment = {
      typedName: input.typedName,
      at: new Date(),
      byUserId: new Types.ObjectId(actor.userId),
      comments: input.comments || undefined,
    };
    evaluation.status = "acknowledged";
    await evaluation.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "performance-evaluation.acknowledged",
      resourceType: "PerformanceEvaluation",
      resourceId: evaluation._id.toString(),
      before: { status: "submitted" },
      after: { status: "acknowledged", hasEmployeeComments: Boolean(input.comments) },
    });
    return evaluation;
  },

  /** One evaluation with the names the form shows: frozen at submit, live while a draft. */
  async getDetail(id: string, organizationId: string, actor: EvaluationActor) {
    const evaluation = await load(id, organizationId);
    assertCanAct(evaluation, actor);
    const orgId = new Types.ObjectId(organizationId);
    const [employeeCard, evaluatorCard, evaluationType] = await Promise.all([
      describeEmployee(evaluation.employeeId, orgId),
      describeEmployee(evaluation.evaluatorEmployeeId, orgId),
      EvaluationTypeService.getByCode(organizationId, evaluation.evaluationFor),
    ]);
    const snapshot = evaluation.snapshot;
    return {
      evaluation: evaluation.toObject(),
      header: {
        employeeName: snapshot?.employeeName ?? employeeCard.name,
        evaluatorName: snapshot?.evaluatorName ?? evaluatorCard.name,
        jobTitle: snapshot?.jobTitle ?? employeeCard.jobTitle,
        projectName: snapshot?.projectName ?? employeeCard.projectName,
        evaluationForName: snapshot?.evaluationForName ?? evaluationType?.name ?? evaluation.evaluationFor,
      },
    };
  },

  /** HR oversight sees every evaluation; an evaluator sees only the ones they are the evaluator of. */
  async list(organizationId: string, actor: EvaluationActor, filter: { employeeId?: string } = {}) {
    await connectMongoDB();
    if (!actor.canManage && !actor.employeeId) return [];
    const evaluations = await PerformanceEvaluationModel.find({
      organizationId: new Types.ObjectId(organizationId),
      ...(filter.employeeId ? { employeeId: new Types.ObjectId(filter.employeeId) } : {}),
      ...(actor.canManage ? {} : { evaluatorEmployeeId: new Types.ObjectId(actor.employeeId!) }),
    })
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    const orgId = new Types.ObjectId(organizationId);
    const ids = [...new Set(evaluations.flatMap((evaluation) => [evaluation.employeeId.toString(), evaluation.evaluatorEmployeeId.toString()]))];
    const cards = new Map(await Promise.all(ids.map(async (employeeId) => [employeeId, await describeEmployee(employeeId, orgId)] as const)));
    const types = new Map((await EvaluationTypeService.listCurrent(organizationId)).map((type: { code: string; name: string }) => [type.code, type.name]));
    return evaluations.map((evaluation) => ({
      ...evaluation,
      employeeName: evaluation.snapshot?.employeeName ?? cards.get(evaluation.employeeId.toString())?.name ?? "—",
      evaluatorName: evaluation.snapshot?.evaluatorName ?? cards.get(evaluation.evaluatorEmployeeId.toString())?.name ?? "—",
      evaluationForName: evaluation.snapshot?.evaluationForName ?? types.get(evaluation.evaluationFor) ?? evaluation.evaluationFor,
    }));
  },
};
