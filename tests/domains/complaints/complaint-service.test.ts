import { describe, it, expect, beforeEach } from "vitest";
import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { AuditLogModel, ComplaintModel, DeletedRecordModel, EmployeeModel, OrganizationModel, PersonModel, ProjectModel } from "@/server/db/models";
import { ComplaintService } from "@/domains/complaints/complaint-service";
import { ComplaintStageService } from "@/domains/catalog/complaint-stage-service";
import { DEFAULT_COMPLAINT_STAGES } from "@/domains/complaints/default-stages";

let counter = 0;

async function seedOrganization(withStages = true) {
  counter += 1;
  const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-complaint-${counter}-${Date.now()}-${Math.random()}` });
  const orgId = organization._id.toString();
  if (withStages) {
    for (const stage of DEFAULT_COMPLAINT_STAGES) await ComplaintStageService.create({ organizationId: orgId, ...stage }, {});
  }
  return { organizationId: organization._id as Types.ObjectId, orgId };
}

async function seedEmployee(organizationId: Types.ObjectId, firstName = "Juan") {
  counter += 1;
  const person = await PersonModel.create({ organizationId, firstName, lastName: "Dela Cruz" });
  const employee = await EmployeeModel.create({ organizationId, personId: person._id, employeeNumber: `C-${counter}-${Math.random()}` });
  return employee._id.toString();
}

const input = (orgId: string, employeeId: string, receivedDate = new Date("2026-11-10")) => ({ organizationId: orgId, employeeId, receivedDate });

describe("ComplaintService", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("creates a complaint in the first stage with the next IR number for the organization", async () => {
    const { organizationId, orgId } = await seedOrganization();
    const employeeId = await seedEmployee(organizationId);

    const first = await ComplaintService.create({ ...input(orgId, employeeId), remarks: "Reported by the shift lead" }, {});
    const second = await ComplaintService.create(input(orgId, employeeId), {});

    expect(first.irNumber).toBe("IR-0001");
    expect(first.stage).toBe("received");
    expect(first.remarks).toBe("Reported by the shift lead");
    expect(first.employeeId.toString()).toBe(employeeId);
    expect(second.irNumber).toBe("IR-0002");
  });

  it("numbers each organization on its own", async () => {
    const a = await seedOrganization();
    const b = await seedOrganization();
    const complaintA = await ComplaintService.create(input(a.orgId, await seedEmployee(a.organizationId)), {});
    const complaintB = await ComplaintService.create(input(b.orgId, await seedEmployee(b.organizationId)), {});
    expect(complaintA.irNumber).toBe("IR-0001");
    expect(complaintB.irNumber).toBe("IR-0001");
  });

  it("starts in the lowest-sorted active stage, skipping a deactivated one", async () => {
    const { organizationId, orgId } = await seedOrganization();
    const employeeId = await seedEmployee(organizationId);
    const received = await ComplaintStageService.getByCode(orgId, "received");
    await ComplaintStageService.updateStatus(received!._id.toString(), orgId, { status: "inactive" }, {});

    const complaint = await ComplaintService.create(input(orgId, employeeId), {});
    expect(complaint.stage).toBe("nte_scheduled");
  });

  it("refuses to create a complaint when the organization has no active stage", async () => {
    const { organizationId, orgId } = await seedOrganization(false);
    const employeeId = await seedEmployee(organizationId);
    await expect(ComplaintService.create(input(orgId, employeeId), {})).rejects.toThrow(/stage/i);
  });

  it("rejects a respondent from another organization, or one that does not exist", async () => {
    const mine = await seedOrganization();
    const other = await seedOrganization();
    const foreignEmployee = await seedEmployee(other.organizationId);

    await expect(ComplaintService.create(input(mine.orgId, foreignEmployee), {})).rejects.toThrow();
    await expect(ComplaintService.create(input(mine.orgId, new Types.ObjectId().toString()), {})).rejects.toThrow();
    expect(await ComplaintModel.countDocuments({ organizationId: mine.organizationId })).toBe(0);
  });

  it("gives two complaints created at the same moment different IR numbers", async () => {
    const { organizationId, orgId } = await seedOrganization();
    const employeeId = await seedEmployee(organizationId);

    const [one, two] = await Promise.all([ComplaintService.create(input(orgId, employeeId), {}), ComplaintService.create(input(orgId, employeeId), {})]);

    expect(new Set([one.irNumber, two.irNumber]).size).toBe(2);
    expect(await ComplaintModel.countDocuments({ organizationId })).toBe(2);
  });

  it("counts a hidden test complaint when numbering, so the next number is not reused", async () => {
    const { organizationId, orgId } = await seedOrganization();
    const employeeId = await seedEmployee(organizationId);
    await ComplaintService.create(input(orgId, employeeId), {});
    const second = await ComplaintService.create(input(orgId, employeeId), {});
    // Naming `hiddenFromOthers` in the filter lets the hidden-data plugin through, so this update reaches the record.
    await ComplaintModel.updateOne({ _id: second._id, hiddenFromOthers: false }, { hiddenFromOthers: true });
    expect(await ComplaintModel.countDocuments({ organizationId, hiddenFromOthers: true })).toBe(1);
    expect(await ComplaintService.listForOrganization(orgId)).toHaveLength(1); // really hidden from ordinary reads

    const third = await ComplaintService.create(input(orgId, employeeId), {});
    expect(third.irNumber).toBe("IR-0003");
  });

  it("does not reuse the IR number of a complaint sitting in the recycle bin", async () => {
    const { organizationId, orgId } = await seedOrganization();
    const employeeId = await seedEmployee(organizationId);
    await ComplaintService.create(input(orgId, employeeId), {});
    // A deleted complaint lives in the recycle bin, not the complaints collection, until restored or purged.
    await DeletedRecordModel.create({ batchId: new Types.ObjectId(), organizationId, collectionName: ComplaintModel.collection.collectionName, doc: { irNumber: "IR-0005" } });

    const next = await ComplaintService.create(input(orgId, employeeId), {});
    expect(next.irNumber).toBe("IR-0006");
  });

  it("lets a complaint be edited when its respondent's record is gone, as long as the respondent is unchanged", async () => {
    const { organizationId, orgId } = await seedOrganization();
    const employeeId = await seedEmployee(organizationId);
    const complaint = await ComplaintService.create(input(orgId, employeeId), {});
    await EmployeeModel.deleteOne({ _id: employeeId });

    const updated = await ComplaintService.update(complaint._id.toString(), orgId, { employeeId, receivedDate: new Date("2026-11-11"), remarks: "Date corrected" }, {});
    expect(updated.remarks).toBe("Date corrected");
    expect(updated.employeeId.toString()).toBe(employeeId);

    // Pointing it at someone who does not exist is still refused.
    await expect(ComplaintService.update(complaint._id.toString(), orgId, { employeeId: new Types.ObjectId().toString(), receivedDate: new Date("2026-11-11") }, {})).rejects.toThrow();
  });

  it("moves a complaint to any configured stage, in any direction", async () => {
    const { organizationId, orgId } = await seedOrganization();
    const complaint = await ComplaintService.create(input(orgId, await seedEmployee(organizationId)), {});
    const id = complaint._id.toString();

    expect((await ComplaintService.moveStage(id, orgId, { stage: "sanction" }, {})).stage).toBe("sanction");
    expect((await ComplaintService.moveStage(id, orgId, { stage: "received" }, {})).stage).toBe("received");
    expect((await ComplaintService.moveStage(id, orgId, { stage: "administrative_hearing" }, {})).stage).toBe("administrative_hearing");
  });

  it("rejects a move to a stage that is not in the catalog", async () => {
    const { organizationId, orgId } = await seedOrganization();
    const complaint = await ComplaintService.create(input(orgId, await seedEmployee(organizationId)), {});
    await expect(ComplaintService.moveStage(complaint._id.toString(), orgId, { stage: "not-a-stage" }, {})).rejects.toThrow();
  });

  it("updates the respondent, date received and remarks", async () => {
    const { organizationId, orgId } = await seedOrganization();
    const original = await seedEmployee(organizationId, "Juan");
    const replacement = await seedEmployee(organizationId, "Maria");
    const complaint = await ComplaintService.create(input(orgId, original), {});

    const updated = await ComplaintService.update(complaint._id.toString(), orgId, { employeeId: replacement, receivedDate: new Date("2026-11-12"), remarks: "Corrected respondent" }, {});

    expect(updated.employeeId.toString()).toBe(replacement);
    expect(updated.receivedDate.toISOString().slice(0, 10)).toBe("2026-11-12");
    expect(updated.remarks).toBe("Corrected respondent");
    expect(updated.irNumber).toBe("IR-0001");
    expect(updated.stage).toBe("received");
  });

  it("audits create, update and stage move, with before and after for the changed fields", async () => {
    const { organizationId, orgId } = await seedOrganization();
    const original = await seedEmployee(organizationId, "Juan");
    const replacement = await seedEmployee(organizationId, "Maria");
    const complaint = await ComplaintService.create(input(orgId, original), {});
    const id = complaint._id.toString();
    await ComplaintService.update(id, orgId, { employeeId: replacement, receivedDate: new Date("2026-11-12"), remarks: "Note" }, {});
    await ComplaintService.moveStage(id, orgId, { stage: "nte_scheduled" }, {});

    const audits = await AuditLogModel.find({ resourceType: "Complaint", resourceId: complaint._id }).sort({ timestamp: 1 }).lean();
    expect(audits.map((audit) => audit.action)).toEqual(["complaint.created", "complaint.updated", "complaint.stage_moved"]);
    expect(audits[0].after).toMatchObject({ irNumber: "IR-0001", stage: "received" });
    expect(String(audits[1].before.employeeId)).toBe(original);
    expect(String(audits[1].after.employeeId)).toBe(replacement);
    expect(audits[1].after.remarks).toBe("Note");
    expect(audits[2].before).toEqual({ stage: "received" });
    expect(audits[2].after).toEqual({ stage: "nte_scheduled" });
  });

  it("treats a complaint in another organization as not found, for update and move alike", async () => {
    const mine = await seedOrganization();
    const other = await seedOrganization();
    const employeeId = await seedEmployee(other.organizationId);
    const theirs = await ComplaintService.create(input(other.orgId, employeeId), {});
    const id = theirs._id.toString();
    const myEmployee = await seedEmployee(mine.organizationId);

    await expect(ComplaintService.update(id, mine.orgId, { employeeId: myEmployee, receivedDate: new Date() }, {})).rejects.toThrow();
    await expect(ComplaintService.moveStage(id, mine.orgId, { stage: "sanction" }, {})).rejects.toThrow();
    expect((await ComplaintService.listForOrganization(mine.orgId)).length).toBe(0);
  });

  it("lists newest date received first and filters by stage", async () => {
    const { organizationId, orgId } = await seedOrganization();
    const employeeId = await seedEmployee(organizationId);
    const older = await ComplaintService.create(input(orgId, employeeId, new Date("2026-10-01")), {});
    const newer = await ComplaintService.create(input(orgId, employeeId, new Date("2026-11-01")), {});
    await ComplaintService.moveStage(older._id.toString(), orgId, { stage: "sanction" }, {});

    expect((await ComplaintService.listForOrganization(orgId)).map((complaint) => complaint.irNumber)).toEqual([newer.irNumber, older.irNumber]);
    expect((await ComplaintService.listForOrganization(orgId, { stage: "sanction" })).map((complaint) => complaint.irNumber)).toEqual([older.irNumber]);
  });
});

describe("ComplaintService incident and stage details", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  async function seedComplaint(extra: Record<string, unknown> = {}) {
    const { organizationId, orgId } = await seedOrganization();
    const employeeId = await seedEmployee(organizationId);
    const complaint = await ComplaintService.create({ ...input(orgId, employeeId), ...extra }, {});
    return { organizationId, orgId, employeeId, id: complaint._id.toString(), complaint };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stored = (id: string) => ComplaintModel.findById(id).lean<Record<string, any>>();

  async function seedProject(organizationId: Types.ObjectId, name: string) {
    counter += 1;
    return (await ProjectModel.create({ organizationId, name, code: `P-${counter}-${Math.random()}` }))._id.toString();
  }

  it("stores the incident details on create, and leaves a blank one out", async () => {
    const { organizationId, orgId } = await seedOrganization();
    const employeeId = await seedEmployee(organizationId);
    const projectId = await seedProject(organizationId, "Tower A");
    const complaint = await ComplaintService.create(
      {
        ...input(orgId, employeeId),
        projectId,
        description: "Late three times",
        what: "Tardiness",
        where: "Gate 2",
        incidentDate: new Date("2026-11-08"),
        complainantName: "Unit owner",
        remarks: "   ",
      },
      {},
    );
    const row = await stored(complaint._id.toString());
    expect(row).toMatchObject({ description: "Late three times", what: "Tardiness", where: "Gate 2", complainantName: "Unit owner" });
    expect(row!.projectId.toString()).toBe(projectId);
    expect(row!.incidentDate.toISOString().slice(0, 10)).toBe("2026-11-08");
    expect(row).not.toHaveProperty("remarks");
  });

  it("updates the incident details, clears a blanked one, and audits them", async () => {
    const { organizationId, orgId, employeeId, id } = await seedComplaint({ complainantName: "Unit owner" });
    const towerA = await seedProject(organizationId, "Tower A");
    const towerB = await seedProject(organizationId, "Tower B");
    await ComplaintService.update(id, orgId, { employeeId, receivedDate: new Date("2026-11-10"), projectId: towerA, complainantName: "Unit owner" }, {});
    await ComplaintService.update(id, orgId, { employeeId, receivedDate: new Date("2026-11-10"), projectId: towerB, complainantName: "" }, {});

    const row = await stored(id);
    expect(row!.projectId.toString()).toBe(towerB);
    expect(row).not.toHaveProperty("complainantName");
    const audit = await AuditLogModel.findOne({ resourceId: new Types.ObjectId(id), action: "complaint.updated" }).sort({ timestamp: -1 }).lean();
    expect(String(audit!.before.projectId)).toBe(towerA);
    expect(audit!.before.complainantName).toBe("Unit owner");
    expect(String(audit!.after.projectId)).toBe(towerB);

    await ComplaintService.update(id, orgId, { employeeId, receivedDate: new Date("2026-11-10"), projectId: "" }, {});
    expect(await stored(id)).not.toHaveProperty("projectId");
  });

  it("refuses a project from another organization or one that does not exist, on create and on update", async () => {
    const mine = await seedOrganization();
    const other = await seedOrganization();
    const employeeId = await seedEmployee(mine.organizationId);
    const foreign = await seedProject(other.organizationId, "Elsewhere");

    await expect(ComplaintService.create({ ...input(mine.orgId, employeeId), projectId: foreign }, {})).rejects.toThrow();
    await expect(ComplaintService.create({ ...input(mine.orgId, employeeId), projectId: new Types.ObjectId().toString() }, {})).rejects.toThrow();
    expect(await ComplaintModel.countDocuments({ organizationId: mine.organizationId })).toBe(0);

    const complaint = await ComplaintService.create(input(mine.orgId, employeeId), {});
    await expect(ComplaintService.update(complaint._id.toString(), mine.orgId, { employeeId, receivedDate: new Date("2026-11-10"), projectId: foreign }, {})).rejects.toThrow();
  });

  it("keeps a complaint editable when its project was later deleted, as long as the project is unchanged", async () => {
    const { organizationId, orgId, employeeId } = await seedOrganization().then(async (org) => ({ ...org, employeeId: await seedEmployee(org.organizationId) }));
    const projectId = await seedProject(organizationId, "Tower A");
    const complaint = await ComplaintService.create({ ...input(orgId, employeeId), projectId }, {});
    await ProjectModel.deleteOne({ _id: projectId });

    const updated = await ComplaintService.update(complaint._id.toString(), orgId, { employeeId, receivedDate: new Date("2026-11-11"), projectId, remarks: "Date corrected" }, {});
    expect(updated.remarks).toBe("Date corrected");
    expect(updated.projectId?.toString()).toBe(projectId);
  });

  it("saves one stage's details, audits before and after, and clears a blanked field", async () => {
    const { orgId, id } = await seedComplaint();
    await ComplaintService.saveStageDetails(id, orgId, { stage: "administrative_hearing", details: { date: "2026-12-01", hearingDate: "2026-12-03", mode: "virtual", remarks: "Sent by email" } }, {});
    expect((await stored(id))!.stageDetails.administrative_hearing).toMatchObject({ mode: "virtual", remarks: "Sent by email" });

    await ComplaintService.saveStageDetails(id, orgId, { stage: "administrative_hearing", details: { hearingDate: "2026-12-03", mode: "", remarks: "Sent by email" } }, {});
    const section = (await stored(id))!.stageDetails.administrative_hearing;
    expect(section).not.toHaveProperty("mode");
    expect(section).not.toHaveProperty("date"); // saving replaces the whole section

    const audits = await AuditLogModel.find({ resourceId: new Types.ObjectId(id), action: "complaint.stage_details_updated" }).sort({ timestamp: 1 }).lean();
    expect(audits).toHaveLength(2);
    expect(audits[0].before ?? {}).toEqual({}); // nothing was recorded before the first save
    expect(audits[1].before.mode).toBe("virtual");
    expect(audits[1].after).not.toHaveProperty("mode");
  });

  it("removes a section entirely when it is saved empty", async () => {
    const { orgId, id } = await seedComplaint();
    await ComplaintService.saveStageDetails(id, orgId, { stage: "sanction", details: { sanction: "Written warning" } }, {});
    await ComplaintService.saveStageDetails(id, orgId, { stage: "sanction", details: {} }, {});
    expect((await stored(id))!.stageDetails ?? {}).not.toHaveProperty("sanction");
  });

  it("refuses a section for an unknown stage, an unknown field, a bad mode, and stores nothing", async () => {
    const { orgId, id } = await seedComplaint();
    await expect(ComplaintService.saveStageDetails(id, orgId, { stage: "not-a-stage", details: { remarks: "x" } }, {})).rejects.toThrow();
    await expect(ComplaintService.saveStageDetails(id, orgId, { stage: "nte_scheduled", details: { mode: "virtual" } }, {})).rejects.toThrow();
    await expect(ComplaintService.saveStageDetails(id, orgId, { stage: "administrative_hearing", details: { mode: "phone" } }, {})).rejects.toThrow();
    expect((await stored(id))!.stageDetails ?? {}).toEqual({});
  });

  it("still saves a section for a stage HR has since deactivated, and keeps it", async () => {
    const { orgId, id } = await seedComplaint();
    await ComplaintService.saveStageDetails(id, orgId, { stage: "nte_scheduled", details: { violations: "Tardiness" } }, {});
    const stage = await ComplaintStageService.getByCode(orgId, "nte_scheduled");
    await ComplaintStageService.updateStatus(stage!._id.toString(), orgId, { status: "inactive" }, {});

    await ComplaintService.saveStageDetails(id, orgId, { stage: "nte_scheduled", details: { violations: "Tardiness", remarks: "Signed" } }, {});
    expect((await stored(id))!.stageDetails.nte_scheduled).toMatchObject({ violations: "Tardiness", remarks: "Signed" });
  });

  it("writes the stage and its details in one move, and puts them in the audit", async () => {
    const { orgId, id } = await seedComplaint();
    const moved = await ComplaintService.moveStage(id, orgId, { stage: "nte_scheduled", details: { date: "2026-11-20", violations: "Tardiness" } }, {});

    expect(moved.stage).toBe("nte_scheduled");
    expect((await stored(id))!.stageDetails.nte_scheduled.violations).toBe("Tardiness");
    const audit = await AuditLogModel.findOne({ resourceId: new Types.ObjectId(id), action: "complaint.stage_moved" }).lean();
    expect(audit!.after).toMatchObject({ stage: "nte_scheduled" });
    expect(audit!.after.details.violations).toBe("Tardiness");
  });

  it("leaves the stage unchanged when the details sent with a move are invalid", async () => {
    const { orgId, id } = await seedComplaint();
    await expect(ComplaintService.moveStage(id, orgId, { stage: "administrative_hearing", details: { mode: "phone" } }, {})).rejects.toThrow();
    const row = await stored(id);
    expect(row!.stage).toBe("received");
    expect(row!.stageDetails ?? {}).toEqual({});
  });

  it("treats a complaint in another organization as not found when saving details", async () => {
    const mine = await seedOrganization();
    const { id } = await seedComplaint();
    await expect(ComplaintService.saveStageDetails(id, mine.orgId, { stage: "sanction", details: { remarks: "x" } }, {})).rejects.toThrow();
  });

  it("keeps an old complaint, made before these fields existed, editable", async () => {
    const { organizationId, orgId } = await seedOrganization();
    const employeeId = await seedEmployee(organizationId);
    const old = await ComplaintModel.collection.insertOne({
      organizationId,
      employeeId: new Types.ObjectId(employeeId),
      irNumber: "IR-0001",
      receivedDate: new Date("2026-10-01"),
      stage: "received",
      hiddenFromOthers: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const id = old.insertedId.toString();

    await ComplaintService.update(id, orgId, { employeeId, receivedDate: new Date("2026-10-02"), what: "Tardiness" }, {});
    await ComplaintService.saveStageDetails(id, orgId, { stage: "sanction", details: { sanction: "Warning" } }, {});
    const row = await stored(id);
    expect(row!.what).toBe("Tardiness");
    expect(row!.stageDetails.sanction.sanction).toBe("Warning");
  });
});
