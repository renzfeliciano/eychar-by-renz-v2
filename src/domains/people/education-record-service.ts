import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { EducationRecordModel, EmployeeModel } from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
import { EducationLevelService } from "@/domains/catalog/education-level-service";
import { NotFoundError, ValidationError } from "@/shared/errors";
import { localDateKey } from "@/lib/date-key";

/** An education entry as the service returns it. */
export type EducationRecordRow = {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  personId: Types.ObjectId;
  levelCode: string;
  school: string;
  course?: string;
  yearGraduated?: number;
};

export type CreateEducationRecordInput = {
  organizationId: string;
  employeeId: string;
  levelCode: string;
  school: string;
  course?: string;
  yearGraduated?: number;
};

/** `""` for course and `null` for year mean "clear it". */
export type UpdateEducationRecordInput = {
  levelCode?: string;
  school?: string;
  course?: string;
  yearGraduated?: number | null;
};

/** An entry as the screens and the API read it: plain strings and numbers, blanks as null. */
export type EducationRecordView = { id: string; levelCode: string; school: string; course: string | null; yearGraduated: number | null };

export function toEducationRecordView(row: EducationRecordRow): EducationRecordView {
  return { id: row._id.toString(), levelCode: row.levelCode, school: row.school, course: row.course ?? null, yearGraduated: row.yearGraduated ?? null };
}

const EARLIEST_YEAR = 1900;

/** The person behind an employee in this organization (education belongs to the person, so it follows a rehire). */
async function personOf(employeeId: string, organizationId: string): Promise<Types.ObjectId> {
  const employee = await EmployeeModel.findOne({ _id: new Types.ObjectId(employeeId), organizationId: new Types.ObjectId(organizationId) }).select("personId").lean();
  if (!employee) throw new NotFoundError("Employee not found in this organization");
  return employee.personId;
}

function cleanSchool(value: string): string {
  const school = value.trim();
  if (!school) throw new ValidationError("Enter the school.");
  if (school.length > 200) throw new ValidationError("The school can be at most 200 characters.");
  return school;
}

/** A blank course is "no course": undefined, never an empty string. */
function cleanCourse(value: string | undefined): string | undefined {
  const course = value?.trim();
  if (!course) return undefined;
  if (course.length > 200) throw new ValidationError("The course can be at most 200 characters.");
  return course;
}

/** A whole year from 1900 up to next year (someone about to graduate), in the organization's zone. */
function cleanYear(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const latest = Number(localDateKey().slice(0, 4)) + 1;
  if (typeof value !== "number" || !Number.isInteger(value) || value < EARLIEST_YEAR || value > latest) {
    throw new ValidationError(`Enter a four-digit year between ${EARLIEST_YEAR} and ${latest}.`);
  }
  return value;
}

const snapshot = (row: { levelCode?: string; school?: string; course?: string | null; yearGraduated?: number | null } | null | undefined) => ({
  levelCode: row?.levelCode,
  school: row?.school,
  course: row?.course ?? undefined,
  yearGraduated: row?.yearGraduated ?? undefined,
});

/** A person's academic qualifications (Educational background on the profile), several per level. */
export const EducationRecordService = {
  /** The employee's entries, in the level's catalog order, then by year (blank years last). */
  async listForEmployee(employeeId: string, organizationId: string): Promise<EducationRecordRow[]> {
    await connectMongoDB();
    const personId = await personOf(employeeId, organizationId);
    const [rows, levels] = await Promise.all([
      EducationRecordModel.find({ organizationId: new Types.ObjectId(organizationId), personId }).lean<EducationRecordRow[]>(),
      EducationLevelService.listCurrent(organizationId),
    ]);
    const levelOrder = new Map(levels.map((level) => [level.code, level.sortOrder]));
    const order = (row: EducationRecordRow) => levelOrder.get(row.levelCode) ?? Number.MAX_SAFE_INTEGER;
    return rows.sort((a, b) => order(a) - order(b) || (a.yearGraduated ?? Infinity) - (b.yearGraduated ?? Infinity) || a._id.toString().localeCompare(b._id.toString()));
  },

  async create(input: CreateEducationRecordInput, actor: { userId?: string }): Promise<EducationRecordRow> {
    await connectMongoDB();
    const personId = await personOf(input.employeeId, input.organizationId);
    const school = cleanSchool(input.school);
    const course = cleanCourse(input.course);
    const yearGraduated = cleanYear(input.yearGraduated);
    await EducationLevelService.assertValidCode(input.organizationId, input.levelCode);

    const created = await EducationRecordModel.create({
      organizationId: new Types.ObjectId(input.organizationId),
      personId,
      levelCode: input.levelCode,
      school,
      ...(course ? { course } : {}),
      ...(yearGraduated !== undefined ? { yearGraduated } : {}),
    });

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "education-record.created",
      resourceType: "EducationRecord",
      resourceId: created._id.toString(),
      after: snapshot(created),
    });
    return created.toObject() as EducationRecordRow;
  },

  /** Level is checked only when it changes, so editing the school on an entry whose level HR retired still works. */
  async update(employeeId: string, recordId: string, organizationId: string, patch: UpdateEducationRecordInput, actor: { userId?: string }): Promise<EducationRecordRow> {
    await connectMongoDB();
    const personId = await personOf(employeeId, organizationId);
    const orgId = new Types.ObjectId(organizationId);
    const existing = await EducationRecordModel.findOne({ _id: new Types.ObjectId(recordId), organizationId: orgId, personId }).lean<EducationRecordRow>();
    if (!existing) throw new NotFoundError("Education entry not found for this employee");

    const set: Record<string, unknown> = {};
    const unset: Record<string, ""> = {};
    if (patch.levelCode !== undefined && patch.levelCode !== existing.levelCode) {
      await EducationLevelService.assertValidCode(organizationId, patch.levelCode);
      set.levelCode = patch.levelCode;
    }
    if (patch.school !== undefined) set.school = cleanSchool(patch.school);
    if (patch.course !== undefined) {
      const course = cleanCourse(patch.course);
      if (course) set.course = course;
      else unset.course = "";
    }
    if (patch.yearGraduated !== undefined) {
      const year = cleanYear(patch.yearGraduated);
      if (year !== undefined) set.yearGraduated = year;
      else unset.yearGraduated = "";
    }

    const updated = await EducationRecordModel.findOneAndUpdate(
      { _id: existing._id, organizationId: orgId, personId },
      { ...(Object.keys(set).length ? { $set: set } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) },
      { returnDocument: "after" },
    ).lean<EducationRecordRow>();
    if (!updated) throw new NotFoundError("Education entry not found for this employee");

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "education-record.updated",
      resourceType: "EducationRecord",
      resourceId: updated._id.toString(),
      before: snapshot(existing),
      after: snapshot(updated),
    });
    return updated;
  },

  async remove(employeeId: string, recordId: string, organizationId: string, actor: { userId?: string }): Promise<void> {
    await connectMongoDB();
    const personId = await personOf(employeeId, organizationId);
    const removed = await EducationRecordModel.findOneAndDelete({ _id: new Types.ObjectId(recordId), organizationId: new Types.ObjectId(organizationId), personId }).lean<EducationRecordRow>();
    if (!removed) throw new NotFoundError("Education entry not found for this employee");

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "education-record.removed",
      resourceType: "EducationRecord",
      resourceId: removed._id.toString(),
      before: snapshot(removed),
    });
  },
};
