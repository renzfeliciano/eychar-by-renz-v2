import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { EmployeeAssignmentModel, EmployeeModel, EmploymentModel, EvaluatorRuleModel, PersonModel, PositionModel } from "@/server/db/models";
import { loadCurrentStaffCheck } from "@/domains/attendance/current-staff";
import { formatPersonName } from "@/lib/person-name";

export type EvaluatorCandidate = { employeeId: string; name: string; positionTitle?: string };
export type EvaluatorResolution = { rule: { id: string; name: string } | null; candidates: EvaluatorCandidate[] };

function inEffect(now: Date) {
  return {
    status: "active",
    effectiveFrom: { $lte: now },
    $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: null }, { effectiveTo: { $gt: now } }],
  };
}

const hasId = (ids: Types.ObjectId[], id?: Types.ObjectId | null) => !!id && ids.some((candidate) => candidate.equals(id));

/**
 * Who may evaluate this employee right now (ADR-051): the first active rule
 * the employee's current position/project matches, then everyone currently in
 * the evaluator position(s) (in the same project when the rule says so) who is
 * still on the staff. Empty `candidates` means no one qualifies; HR oversight
 * can then name an evaluator by hand.
 */
export async function resolveEvaluators(employeeId: string, organizationId: string, now: Date = new Date()): Promise<EvaluatorResolution> {
  await connectMongoDB();
  const orgId = new Types.ObjectId(organizationId);

  const assignment = await EmployeeAssignmentModel.findOne({ organizationId: orgId, employeeId: new Types.ObjectId(employeeId), ...inEffect(now) })
    .sort({ effectiveFrom: -1 })
    .lean();

  const rules = await EvaluatorRuleModel.find({ organizationId: orgId, status: "active" }).sort({ order: 1, createdAt: 1 }).lean();
  const rule = rules.find((candidate) => {
    const positionOk = candidate.subjectPositionIds.length === 0 || hasId(candidate.subjectPositionIds, assignment?.positionId);
    const projectOk = candidate.subjectProjectIds.length === 0 || hasId(candidate.subjectProjectIds, assignment?.projectId);
    return positionOk && projectOk;
  });
  if (!rule || rule.evaluatorPositionIds.length === 0) return { rule: rule ? { id: rule._id.toString(), name: rule.name } : null, candidates: [] };
  const ruleRef = { id: rule._id.toString(), name: rule.name };
  if (rule.evaluatorScope === "same-project" && !assignment?.projectId) return { rule: ruleRef, candidates: [] };

  const holders = await EmployeeAssignmentModel.find({
    organizationId: orgId,
    positionId: { $in: rule.evaluatorPositionIds },
    employeeId: { $ne: new Types.ObjectId(employeeId) },
    ...(rule.evaluatorScope === "same-project" ? { projectId: assignment!.projectId } : {}),
    ...inEffect(now),
  }).lean();
  const positionByEmployee = new Map(holders.map((holder) => [holder.employeeId.toString(), holder.positionId]));
  const holderIds = [...positionByEmployee.keys()].map((id) => new Types.ObjectId(id));
  if (holderIds.length === 0) return { rule: ruleRef, candidates: [] };

  const [isCurrentStaff, employments, employees, positions] = await Promise.all([
    loadCurrentStaffCheck(organizationId),
    EmploymentModel.find({ organizationId: orgId, employeeId: { $in: holderIds } }).sort({ effectiveFrom: -1 }).lean(),
    EmployeeModel.find({ organizationId: orgId, _id: { $in: holderIds } }).lean(),
    PositionModel.find({ organizationId: orgId, _id: { $in: rule.evaluatorPositionIds } }).lean(),
  ]);

  const latestEmployment = new Map<string, (typeof employments)[number]>();
  for (const employment of employments) if (!latestEmployment.has(employment.employeeId.toString())) latestEmployment.set(employment.employeeId.toString(), employment);
  const people = await PersonModel.find({ _id: { $in: employees.map((employee) => employee.personId) } }).lean();
  const personById = new Map(people.map((person) => [person._id.toString(), person]));
  const titleById = new Map(positions.map((position) => [position._id.toString(), position.title]));

  const candidates = employees
    .filter((employee) => {
      const employment = latestEmployment.get(employee._id.toString());
      const ended = employment?.effectiveTo && new Date(employment.effectiveTo).getTime() <= now.getTime();
      return employment && !ended && isCurrentStaff(employment.status);
    })
    .map((employee) => ({
      employeeId: employee._id.toString(),
      name: formatPersonName(personById.get(employee.personId.toString())),
      positionTitle: titleById.get(positionByEmployee.get(employee._id.toString())?.toString() ?? ""),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { rule: ruleRef, candidates };
}
