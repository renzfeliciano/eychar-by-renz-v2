import { describe, it, expect, beforeEach } from "vitest";
import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import {
  AuditLogModel,
  EmployeeAssignmentModel,
  EmployeeModel,
  EmploymentModel,
  EvaluatorRuleModel,
  OrganizationModel,
  PersonModel,
  PositionModel,
  ProjectModel,
} from "@/server/db/models";
import { EvaluationTypeService } from "@/domains/catalog/evaluation-type-service";
import { resolveEvaluators } from "@/domains/performance/evaluator-resolver";
import { PerformanceEvaluationService } from "@/domains/performance/performance-evaluation-service";
import { CURRENT_TEMPLATE_VERSION, criterionKeys, getTemplate } from "@/domains/performance/evaluation-template";
import type { EvaluationActor } from "@/domains/performance/evaluation-actor";

type Org = { _id: Types.ObjectId };

/** An organization shaped like the real one: a president, an operations manager, two sites with a building administrator each, and head office. */
async function seedWorld() {
  const organization = (await OrganizationModel.create({ name: "Acme", slug: `acme-eval-${Date.now()}-${Math.random()}` })) as Org;
  const organizationId = organization._id;
  const orgId = organizationId.toString();

  const position = async (code: string, title: string) => PositionModel.create({ organizationId, code, title });
  const [president, opsManager, bldgAdmin, frontDesk, hrGeneralist] = await Promise.all([
    position("PRESIDENT", "President"),
    position("OPS-MANAGER", "Operations Manager"),
    position("BLDG-ADMIN", "Building Administrator"),
    position("FRONT-DESK", "Front Desk"),
    position("HR", "HR Generalist"),
  ]);
  const project = (code: string) => ProjectModel.create({ organizationId, code, name: code });
  const [siteA, siteB, headOffice] = await Promise.all([project("SITE-A"), project("SITE-B"), project("PCAS-HO")]);

  let counter = 0;
  async function person(name: string, positionId: Types.ObjectId, projectId: Types.ObjectId, employment: { status?: string; effectiveTo?: Date } = {}) {
    counter += 1;
    const personDoc = await PersonModel.create({ organizationId, firstName: name, lastName: "Test" });
    const employee = await EmployeeModel.create({ organizationId, personId: personDoc._id, employeeNumber: `E-${counter}-${Math.random()}` });
    await EmploymentModel.create({ organizationId, employeeId: employee._id, employmentType: "regular", status: employment.status ?? "active", effectiveTo: employment.effectiveTo });
    await EmployeeAssignmentModel.create({ organizationId, employeeId: employee._id, positionId, projectId });
    return employee._id.toString();
  }

  const people = {
    president: await person("Pres", president._id, headOffice._id),
    ops: await person("Ops", opsManager._id, headOffice._id),
    adminA: await person("AdminA", bldgAdmin._id, siteA._id),
    adminB: await person("AdminB", bldgAdmin._id, siteB._id),
    clerkA: await person("ClerkA", frontDesk._id, siteA._id),
    hr: await person("Hr", hrGeneralist._id, headOffice._id),
  };

  const rule = (name: string, order: number, subject: { positions?: Types.ObjectId[]; projects?: Types.ObjectId[] }, evaluators: Types.ObjectId[], scope: "organization" | "same-project") =>
    EvaluatorRuleModel.create({ organizationId, name, order, subjectPositionIds: subject.positions ?? [], subjectProjectIds: subject.projects ?? [], evaluatorPositionIds: evaluators, evaluatorScope: scope });
  await rule("President is not evaluated by rule", 5, { positions: [president._id] }, [], "organization");
  await rule("Ops by President", 10, { positions: [opsManager._id] }, [president._id], "organization");
  await rule("Admins by Ops", 20, { positions: [bldgAdmin._id] }, [opsManager._id], "organization");
  await rule("Head office by Ops", 30, { projects: [headOffice._id] }, [opsManager._id], "organization");
  await rule("Site staff by their admin", 40, {}, [bldgAdmin._id], "same-project");

  await EvaluationTypeService.create({ organizationId: orgId, code: "probationary", name: "Probationary Employment", sortOrder: 1 }, {});
  await EvaluationTypeService.create({ organizationId: orgId, code: "regularization", name: "Regularization", sortOrder: 2 }, {});

  return { orgId, organization, people, employeeIdOf: (key: keyof typeof people) => people[key] };
}

const actorFor = (employeeId: string | null, canManage = false): EvaluationActor => ({ userId: new Types.ObjectId().toString(), employeeId, canManage });
const period = { periodStart: new Date("2026-07-01"), periodEnd: new Date("2026-09-30") };

async function fullyRate(id: string, orgId: string, actor: EvaluationActor, rating: "S" | "A" | "NI" = "S") {
  const ratings = criterionKeys(getTemplate(CURRENT_TEMPLATE_VERSION)).map((criterionKey) => ({ criterionKey, rating }));
  return PerformanceEvaluationService.saveDraft(id, orgId, { organizationId: orgId, ratings, goals: "Keep going", evaluatorComments: "Solid" }, actor);
}

describe("evaluator rules", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("matches each tier of the company structure", async () => {
    const { orgId, people } = await seedWorld();
    const names = async (employeeId: string) => (await resolveEvaluators(employeeId, orgId)).candidates.map((candidate) => candidate.employeeId);

    // Rank-and-file on a project: the Building Administrator of the same project only.
    expect(await names(people.clerkA)).toEqual([people.adminA]);
    // Building Administrator: the Operations Manager.
    expect(await names(people.adminA)).toEqual([people.ops]);
    // Head Office staff below the Operations Manager: the Operations Manager.
    expect(await names(people.hr)).toEqual([people.ops]);
    // Operations Manager: the President (the head-office rule below must not catch them first).
    expect(await names(people.ops)).toEqual([people.president]);
  });

  it("finds no one when the evaluator has left or no one holds the position", async () => {
    const { orgId, people } = await seedWorld();
    await EmploymentModel.updateMany({ employeeId: new Types.ObjectId(people.adminA) }, { $set: { effectiveTo: new Date("2020-01-01") } });
    expect((await resolveEvaluators(people.clerkA, orgId)).candidates).toEqual([]);
    // The President sits in head office but is not caught by the head-office rule: no evaluator matches, HR names one.
    expect((await resolveEvaluators(people.president, orgId)).candidates).toEqual([]);
  });
});

describe("PerformanceEvaluationService", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("lets the matching evaluator start a draft and rejects everyone else", async () => {
    const { orgId, people } = await seedWorld();
    const input = (evaluatorId: string) => ({ organizationId: orgId, employeeId: people.clerkA, evaluatorId, evaluationFor: "probationary", ...period });

    const evaluation = await PerformanceEvaluationService.create(input(people.adminA), actorFor(people.adminA));
    expect(evaluation.status).toBe("draft");
    expect(evaluation.evaluatorOverride).toBe(false);

    // The other site's administrator is not an authorized evaluator for this employee.
    await expect(PerformanceEvaluationService.create(input(people.adminB), actorFor(people.adminB))).rejects.toThrow(/not an authorized evaluator/i);
    // Someone cannot start it in another person's name.
    await expect(PerformanceEvaluationService.create(input(people.adminA), actorFor(people.adminB))).rejects.toThrow(/as its evaluator/i);
    // Nobody evaluates themselves.
    await expect(
      PerformanceEvaluationService.create({ ...input(people.clerkA), evaluatorId: people.clerkA }, actorFor(people.clerkA, true)),
    ).rejects.toThrow(/themselves/i);
    // An unconfigured evaluation type is refused.
    await expect(PerformanceEvaluationService.create({ ...input(people.adminA), evaluationFor: "bogus" }, actorFor(people.adminA))).rejects.toThrow(/not a configured/i);
    // The period must run forward.
    await expect(PerformanceEvaluationService.create({ ...input(people.adminA), periodStart: new Date("2026-10-01"), periodEnd: new Date("2026-09-01") }, actorFor(people.adminA))).rejects.toThrow(/period/i);
  });

  it("lets HR oversight name any evaluator, and records the override", async () => {
    const { orgId, people } = await seedWorld();
    const evaluation = await PerformanceEvaluationService.create(
      { organizationId: orgId, employeeId: people.clerkA, evaluatorId: people.hr, evaluationFor: "regularization", ...period },
      actorFor(null, true),
    );
    expect(evaluation.evaluatorOverride).toBe(true);
    const audit = await AuditLogModel.findOne({ resourceId: evaluation._id, action: "performance-evaluation.created" }).lean();
    expect(audit?.metadata).toMatchObject({ evaluatorRuleOverride: true });
  });

  it("needs every criterion rated, locks on submit, and keeps a frozen snapshot", async () => {
    const { orgId, people } = await seedWorld();
    const actor = actorFor(people.adminA);
    const evaluation = await PerformanceEvaluationService.create({ organizationId: orgId, employeeId: people.clerkA, evaluatorId: people.adminA, evaluationFor: "probationary", ...period }, actor);
    const id = evaluation._id.toString();

    await expect(PerformanceEvaluationService.submit(id, orgId, { organizationId: orgId, typedName: "Admin A Test" }, actor)).rejects.toThrow(/Rate every criterion/);
    await expect(PerformanceEvaluationService.saveDraft(id, orgId, { organizationId: orgId, ratings: [{ criterionKey: "nope", rating: "S" }] }, actor)).rejects.toThrow(/Unknown criterion/);

    await fullyRate(id, orgId, actor);
    const submitted = await PerformanceEvaluationService.submit(id, orgId, { organizationId: orgId, typedName: "AdminA Test" }, actor);
    expect(submitted.status).toBe("submitted");
    expect(submitted.evaluatorAcknowledgment?.typedName).toBe("AdminA Test");
    expect(submitted.snapshot).toMatchObject({ employeeName: "ClerkA Test", evaluatorName: "AdminA Test", jobTitle: "Front Desk", projectName: "SITE-A", evaluationForName: "Probationary Employment" });

    // Locked: no more edits, no second submit.
    await expect(fullyRate(id, orgId, actor, "NI")).rejects.toThrow(/can no longer be edited/);
    await expect(PerformanceEvaluationService.submit(id, orgId, { organizationId: orgId, typedName: "AdminA Test" }, actor)).rejects.toThrow(/Only a draft/);

    // The printed names do not follow later profile changes.
    await PersonModel.updateOne({ firstName: "ClerkA" }, { $set: { firstName: "Renamed" } });
    const detail = await PerformanceEvaluationService.getDetail(id, orgId, actor);
    expect(detail.header.employeeName).toBe("ClerkA Test");
  });

  it("records the employee's acknowledgment with their comments, once, and only after submit", async () => {
    const { orgId, people } = await seedWorld();
    const actor = actorFor(people.adminA);
    const evaluation = await PerformanceEvaluationService.create({ organizationId: orgId, employeeId: people.clerkA, evaluatorId: people.adminA, evaluationFor: "probationary", ...period }, actor);
    const id = evaluation._id.toString();
    const acknowledgment = { organizationId: orgId, typedName: "ClerkA Test", comments: "I disagree with the initiative rating." };

    await expect(PerformanceEvaluationService.acknowledge(id, orgId, acknowledgment, actor)).rejects.toThrow(/Submit the evaluation first|before the employee/i);

    await fullyRate(id, orgId, actor, "A");
    await PerformanceEvaluationService.submit(id, orgId, { organizationId: orgId, typedName: "AdminA Test" }, actor);
    const acknowledged = await PerformanceEvaluationService.acknowledge(id, orgId, acknowledgment, actor);

    expect(acknowledged.status).toBe("acknowledged");
    expect(acknowledged.employeeAcknowledgment).toMatchObject({ typedName: "ClerkA Test", comments: "I disagree with the initiative rating." });
    await expect(PerformanceEvaluationService.acknowledge(id, orgId, acknowledgment, actor)).rejects.toThrow(/already been acknowledged/);

    const actions = (await AuditLogModel.find({ resourceId: evaluation._id }).lean()).map((entry) => entry.action);
    expect(actions).toEqual(expect.arrayContaining(["performance-evaluation.created", "performance-evaluation.submitted", "performance-evaluation.acknowledged"]));
  });

  it("only lets the evaluator of record, or HR oversight, act on an evaluation", async () => {
    const { orgId, people } = await seedWorld();
    const evaluation = await PerformanceEvaluationService.create({ organizationId: orgId, employeeId: people.clerkA, evaluatorId: people.adminA, evaluationFor: "probationary", ...period }, actorFor(people.adminA));
    const id = evaluation._id.toString();
    const outsider = actorFor(people.adminB);

    await expect(PerformanceEvaluationService.saveDraft(id, orgId, { organizationId: orgId, goals: "x" }, outsider)).rejects.toThrow(/assigned evaluator/);
    await expect(PerformanceEvaluationService.getDetail(id, orgId, outsider)).rejects.toThrow(/assigned evaluator/);
    await expect(PerformanceEvaluationService.getDetail(id, orgId, actorFor(null))).rejects.toThrow(/assigned evaluator/);
    // Oversight can.
    await expect(PerformanceEvaluationService.saveDraft(id, orgId, { organizationId: orgId, goals: "ok" }, actorFor(null, true))).resolves.toBeTruthy();
    // Another organization cannot see it at all.
    const other = await seedWorld();
    await expect(PerformanceEvaluationService.getDetail(id, other.orgId, actorFor(null, true))).rejects.toThrow(/not found/i);
  });

  it("lists everything for oversight and only their own for an evaluator", async () => {
    const { orgId, people } = await seedWorld();
    await PerformanceEvaluationService.create({ organizationId: orgId, employeeId: people.clerkA, evaluatorId: people.adminA, evaluationFor: "probationary", ...period }, actorFor(people.adminA));
    await PerformanceEvaluationService.create({ organizationId: orgId, employeeId: people.adminA, evaluatorId: people.ops, evaluationFor: "regularization", ...period }, actorFor(people.ops));

    expect(await PerformanceEvaluationService.list(orgId, actorFor(null, true))).toHaveLength(2);
    const mine = await PerformanceEvaluationService.list(orgId, actorFor(people.adminA));
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ employeeName: "ClerkA Test", evaluationForName: "Probationary Employment" });
    expect(await PerformanceEvaluationService.list(orgId, actorFor(null))).toEqual([]);
  });
});
