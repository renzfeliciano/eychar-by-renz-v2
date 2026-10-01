import { Types, type PipelineStage } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { EmployeeAssignmentModel, EmployeeModel, EmploymentModel, PersonModel } from "@/server/db/models";
import { formatPersonName } from "@/lib/person-name";
import { calculateAge, formatLengthOfService } from "@/lib/employee-dates";
import { EmployeeService } from "./employee-service";

export type RosterSort = "name" | "employeeNumber" | "status" | "age" | "lengthOfService";

export type RosterPageQuery = {
  q?: string;
  sort?: string;
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
  employmentType?: string;
  /** Positions whose title matches `q`, resolved by the caller from its position list. */
  positionIdsMatchingQ?: string[];
  /** Status code → display name, so "status" sorts by what people see. */
  statusNames?: Map<string, string>;
};

type RosterPerson = { firstName: string; middleName?: string; lastName: string; email?: string; birthDate?: Date };
export type RosterRow = {
  _id: Types.ObjectId;
  employeeNumber?: string;
  person: RosterPerson | null;
  currentEmployment: { status: string; employmentType: string; effectiveFrom?: Date } | null;
  currentAssignment: { positionId?: Types.ObjectId; projectId?: Types.ObjectId } | null;
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Each employee joined with their latest employment and assignment, inside the database. */
function joinCurrent(): PipelineStage[] {
  const latest = (from: string, as: string, project: Record<string, 1>): PipelineStage.Lookup => ({
    $lookup: {
      from,
      let: { employeeId: "$_id" },
      pipeline: [{ $match: { $expr: { $eq: ["$employeeId", "$$employeeId"] } } }, { $sort: { effectiveFrom: -1 } }, { $limit: 1 }, { $project: project }],
      as,
    },
  });
  return [
    { $lookup: { from: PersonModel.collection.collectionName, localField: "personId", foreignField: "_id", as: "person" } },
    latest(EmploymentModel.collection.collectionName, "currentEmployment", { status: 1, employmentType: 1, effectiveFrom: 1, endOfContract: 1 }),
    latest(EmployeeAssignmentModel.collection.collectionName, "currentAssignment", { positionId: 1, projectId: 1 }),
    {
      $set: {
        person: { $first: "$person" },
        currentEmployment: { $first: "$currentEmployment" },
        currentAssignment: { $first: "$currentAssignment" },
      },
    },
  ];
}

/** Sort keys for each column. Rows missing the value go last in either direction, as before. */
function sortStages(query: RosterPageQuery): PipelineStage.FacetPipelineStage[] {
  const direction = query.dir === "desc" ? -1 : 1;
  const sort = (query.sort ?? "name") as RosterSort;
  let value: unknown;
  let order = direction;
  switch (sort) {
    case "employeeNumber":
      value = "$employeeNumber";
      break;
    case "status": {
      const branches = [...(query.statusNames ?? new Map())].map(([code, name]) => ({ case: { $eq: ["$currentEmployment.status", code] }, then: name }));
      value = branches.length ? { $switch: { branches, default: "$currentEmployment.status" } } : "$currentEmployment.status";
      break;
    }
    case "age":
      // Older first means an earlier birth date.
      value = "$person.birthDate";
      order = -direction as 1 | -1;
      break;
    case "lengthOfService":
      value = "$currentEmployment.effectiveFrom";
      break;
    default:
      value = { $trim: { input: { $concat: [{ $ifNull: ["$person.firstName", ""] }, " ", { $ifNull: ["$person.middleName", ""] }, " ", { $ifNull: ["$person.lastName", ""] }] } } };
  }
  return [
    { $set: { _sortValue: value, _sortMissing: { $cond: [{ $in: [{ $ifNull: [value, ""] }, ["", null]] }, 1, 0] } } },
    { $sort: { _sortMissing: 1, _sortValue: order as 1 | -1, _id: 1 } },
  ];
}

/**
 * The employee roster, searched, sorted and paged by the database, so a
 * page view reads one page of people, not the whole organization.
 */
export const EmployeeRosterService = {
  async page(organizationId: string, query: RosterPageQuery): Promise<{ rows: RosterRow[]; total: number }> {
    await connectMongoDB();
    const match: Record<string, unknown>[] = [];
    if (query.employmentType) match.push({ "currentEmployment.employmentType": query.employmentType });
    if (query.q) {
      const needle = new RegExp(escapeRegex(query.q.trim()), "i");
      const or: Record<string, unknown>[] = [
        { employeeNumber: needle },
        { $expr: { $regexMatch: { input: { $concat: [{ $ifNull: ["$person.firstName", ""] }, " ", { $ifNull: ["$person.middleName", ""] }, " ", { $ifNull: ["$person.lastName", ""] }] }, regex: escapeRegex(query.q.trim()), options: "i" } } },
        { $expr: { $regexMatch: { input: { $concat: [{ $ifNull: ["$person.firstName", ""] }, " ", { $ifNull: ["$person.lastName", ""] }] }, regex: escapeRegex(query.q.trim()), options: "i" } } },
      ];
      const positionIds = (query.positionIdsMatchingQ ?? []).filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
      if (positionIds.length) or.push({ "currentAssignment.positionId": { $in: positionIds } });
      match.push({ $or: or });
    }

    const [result] = await EmployeeModel.aggregate<{ rows: RosterRow[]; total: { count: number }[] }>(
      [
        { $match: { organizationId: new Types.ObjectId(organizationId) } },
        ...joinCurrent(),
        ...(match.length ? [{ $match: { $and: match } }] : []),
        {
          $facet: {
            rows: [
              ...sortStages(query),
              { $skip: (query.page - 1) * query.pageSize },
              { $limit: query.pageSize },
              {
                $project: {
                  employeeNumber: 1,
                  "person.firstName": 1,
                  "person.middleName": 1,
                  "person.lastName": 1,
                  "person.email": 1,
                  "person.birthDate": 1,
                  currentEmployment: 1,
                  currentAssignment: 1,
                },
              },
            ],
            total: [{ $count: "count" }],
          },
        },
      ],
      { collation: { locale: "en", strength: 2 } },
    );
    return { rows: result?.rows ?? [], total: result?.total[0]?.count ?? 0 };
  },

  /**
   * The roster's summary strip, from a few fields per employee (no names or
   * IDs leave the database): headcount by status, recent hires, contracts
   * ending soon, and current staff missing a statutory ID.
   */
  async summary(organizationId: string, activeCodes: Set<string>, now: Date = new Date()) {
    await connectMongoDB();
    const rows = await EmployeeModel.aggregate<{ status?: string; hiredAt?: Date; endOfContract?: Date; idsComplete: boolean }>([
      { $match: { organizationId: new Types.ObjectId(organizationId) } },
      ...joinCurrent(),
      {
        $project: {
          _id: 0,
          status: "$currentEmployment.status",
          hiredAt: "$currentEmployment.effectiveFrom",
          endOfContract: "$currentEmployment.endOfContract",
          idsComplete: {
            $and: [
              { $gt: [{ $strLenCP: { $ifNull: ["$person.sssNumber", ""] } }, 0] },
              { $gt: [{ $strLenCP: { $ifNull: ["$person.philHealthNumber", ""] } }, 0] },
              { $gt: [{ $strLenCP: { $ifNull: ["$person.pagIbigNumber", ""] } }, 0] },
              { $gt: [{ $strLenCP: { $ifNull: ["$person.tinNumber", ""] } }, 0] },
            ],
          },
        },
      },
    ]);

    const DAY_MS = 86_400_000;
    const nowMs = now.getTime();
    const statusCounts = new Map<string, number>();
    for (const row of rows) if (row.status) statusCounts.set(row.status, (statusCounts.get(row.status) ?? 0) + 1);
    const currentStaff = rows.filter((row) => activeCodes.size === 0 || activeCodes.has(row.status ?? ""));
    return {
      statusCounts,
      headcount: currentStaff.length,
      newHires: currentStaff.filter((row) => row.hiredAt && nowMs - new Date(row.hiredAt).getTime() <= 90 * DAY_MS).length,
      endingSoon: currentStaff.filter((row) => {
        const end = row.endOfContract ? new Date(row.endOfContract).getTime() : null;
        return end !== null && end >= nowMs - DAY_MS && end - nowMs <= 30 * DAY_MS;
      }).length,
      missingIds: currentStaff.filter((row) => !row.idsComplete).length,
    };
  },

  /**
   * Every employee (optionally of one employment type) resolved for the
   * roster export and print: names, contact details and statutory IDs.
   * Served on request by GET /api/employees/export, which is permission
   * checked, rate limited and audited, rather than sent with every page view.
   */
  async exportRows(
    organizationId: string,
    lookups: { positionTitleById: Map<string, string>; projectNameById: Map<string, string>; statusNameByCode: Map<string, string> },
    employmentType?: string,
  ): Promise<RosterExportRow[]> {
    const roster = await EmployeeService.listWithCurrentStatus(organizationId);
    return roster
      .filter((row) => !employmentType || row.currentEmployment?.employmentType === employmentType)
      .map((row) => {
        const dateHired = row.currentEmployment?.effectiveFrom;
        const birthDate = row.person?.birthDate;
        return {
          employeeNumber: row.employeeNumber ?? "—",
          name: row.person ? formatPersonName(row.person) : "—",
          gender: row.person?.gender ?? "",
          position: row.currentAssignment?.positionId ? (lookups.positionTitleById.get(row.currentAssignment.positionId.toString()) ?? "—") : "—",
          project: row.currentAssignment?.projectId ? (lookups.projectNameById.get(row.currentAssignment.projectId.toString()) ?? "—") : "—",
          employmentStatus: row.currentEmployment ? (lookups.statusNameByCode.get(row.currentEmployment.status) ?? row.currentEmployment.status) : "—",
          age: birthDate ? String(calculateAge(new Date(birthDate))) : "",
          lengthOfService: dateHired ? formatLengthOfService(new Date(dateHired)) : "—",
          dateHired: dateHired ? new Date(dateHired).toISOString().slice(0, 10) : "",
          birthDate: birthDate ? new Date(birthDate).toISOString().slice(0, 10) : "",
          contactNumber: row.person?.phone ?? "",
          address: row.person?.address ?? "",
          sssNumber: row.person?.sssNumber ?? "",
          philHealthNumber: row.person?.philHealthNumber ?? "",
          pagIbigNumber: row.person?.pagIbigNumber ?? "",
          tinNumber: row.person?.tinNumber ?? "",
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  },
};

export type RosterExportRow = {
  employeeNumber: string;
  name: string;
  gender: string;
  position: string;
  project: string;
  employmentStatus: string;
  age: string;
  lengthOfService: string;
  dateHired: string;
  birthDate: string;
  contactNumber: string;
  address: string;
  sssNumber: string;
  philHealthNumber: string;
  pagIbigNumber: string;
  tinNumber: string;
};
