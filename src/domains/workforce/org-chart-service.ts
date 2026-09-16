import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import {
  EmployeeAssignmentModel,
  EmployeeModel,
  PersonModel,
  PositionModel,
  OrganizationUnitModel,
  ProjectModel,
  EmploymentModel,
} from "@/server/db/models";

export type OrgChartFilters = {
  asOf?: Date;
  search?: string;
  organizationUnitId?: string;
  positionId?: string;
  projectId?: string;
  employmentStatus?: string;
};

export type OrgChartNode = {
  employeeId: string;
  name: string;
  employmentStatus: string | null;
  positionTitle: string | null;
  organizationUnitName: string | null;
  projectName: string | null;
  children: OrgChartNode[];
};

export type VacantPosition = {
  id: string;
  title: string;
  code: string;
  organizationUnitName: string | null;
};

export type OrgChartSnapshot = {
  roots: OrgChartNode[];
  vacantPositions: VacantPosition[];
};

/**
 * The org chart is a projection, never a source of truth (AGENTS.md §18) —
 * everything here is a read-only query over Employee/EmployeeAssignment/
 * Position/OrganizationUnit/Project data that Phases 2–3 already own.
 */
export const OrgChartService = {
  async getSnapshot(organizationId: string, filters: OrgChartFilters): Promise<OrgChartSnapshot> {
    await connectMongoDB();

    const orgObjectId = new Types.ObjectId(organizationId);
    const asOf = filters.asOf ?? new Date();

    // Bulk generalization of the same effective-dating filter
    // EmployeeAssignmentService.getAsOf uses per-employee — because
    // transfer() always closes the prior row exactly at the new row's
    // effectiveFrom, this returns at most one row per employee.
    const assignments = await EmployeeAssignmentModel.find({
      organizationId: orgObjectId,
      effectiveFrom: { $lte: asOf },
      $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: null }, { effectiveTo: { $gte: asOf } }],
    }).lean();

    const employeeIds = assignments.map((assignment) => assignment.employeeId);
    const [employees, positions, units, projects, employments] = await Promise.all([
      EmployeeModel.find({ _id: { $in: employeeIds } }).lean(),
      PositionModel.find({ organizationId: orgObjectId }).lean(),
      OrganizationUnitModel.find({ organizationId: orgObjectId }).lean(),
      ProjectModel.find({ organizationId: orgObjectId }).lean(),
      EmploymentModel.find({ employeeId: { $in: employeeIds } }).sort({ effectiveFrom: -1 }).lean(),
    ]);

    const persons = await PersonModel.find({ _id: { $in: employees.map((employee) => employee.personId) } }).lean();
    const personById = new Map(persons.map((person) => [person._id.toString(), person]));
    const positionById = new Map(positions.map((position) => [position._id.toString(), position]));
    const unitById = new Map(units.map((unit) => [unit._id.toString(), unit]));
    const projectById = new Map(projects.map((project) => [project._id.toString(), project]));
    const employeeById = new Map(employees.map((employee) => [employee._id.toString(), employee]));

    const latestEmploymentByEmployee = new Map<string, (typeof employments)[number]>();
    for (const employment of employments) {
      const key = employment.employeeId.toString();
      if (!latestEmploymentByEmployee.has(key)) latestEmploymentByEmployee.set(key, employment);
    }

    const search = filters.search?.trim().toLowerCase();
    const nodesById = new Map<string, OrgChartNode>();
    const reportsTo = new Map<string, string | undefined>();

    for (const assignment of assignments) {
      const employeeId = assignment.employeeId.toString();
      const employee = employeeById.get(employeeId);
      const person = employee ? personById.get(employee.personId.toString()) : undefined;
      if (!employee || !person) continue;

      if (filters.organizationUnitId && assignment.organizationUnitId?.toString() !== filters.organizationUnitId) continue;
      if (filters.positionId && assignment.positionId?.toString() !== filters.positionId) continue;
      if (filters.projectId && assignment.projectId?.toString() !== filters.projectId) continue;

      const employmentStatus = latestEmploymentByEmployee.get(employeeId)?.status ?? null;
      if (filters.employmentStatus && employmentStatus !== filters.employmentStatus) continue;

      const name = `${person.firstName} ${person.lastName}`;
      if (search && !name.toLowerCase().includes(search)) continue;

      nodesById.set(employeeId, {
        employeeId,
        name,
        employmentStatus,
        positionTitle: assignment.positionId ? positionById.get(assignment.positionId.toString())?.title ?? null : null,
        organizationUnitName: assignment.organizationUnitId
          ? unitById.get(assignment.organizationUnitId.toString())?.name ?? null
          : null,
        projectName: assignment.projectId ? projectById.get(assignment.projectId.toString())?.name ?? null : null,
        children: [],
      });
      reportsTo.set(employeeId, assignment.reportsToEmployeeId?.toString());
    }

    const roots = buildTree(nodesById, reportsTo);

    const filledPositionIds = new Set(
      assignments.filter((assignment) => assignment.positionId).map((assignment) => assignment.positionId!.toString()),
    );
    const vacantPositions: VacantPosition[] = positions
      .filter((position) => position.status === "active" && !filledPositionIds.has(position._id.toString()))
      .map((position) => ({
        id: position._id.toString(),
        title: position.title,
        code: position.code,
        organizationUnitName: position.organizationUnitId
          ? unitById.get(position.organizationUnitId.toString())?.name ?? null
          : null,
      }));

    return { roots, vacantPositions };
  },
};

/**
 * Attaches each node under its manager if that manager is also in the
 * (already-filtered) set — otherwise the node is a root. If a node's own
 * manager chain cycles back on itself (nothing currently prevents an
 * indirect, multi-hop reporting cycle — only direct self-report is
 * blocked at write time), it is surfaced as a root too rather than being
 * silently unreachable from every declared root.
 */
function buildTree(nodesById: Map<string, OrgChartNode>, reportsTo: Map<string, string | undefined>): OrgChartNode[] {
  function chainIsAcyclic(startId: string): boolean {
    const visited = new Set<string>();
    let current = startId;
    while (true) {
      if (visited.has(current)) return false;
      visited.add(current);
      const managerId = reportsTo.get(current);
      if (!managerId || !nodesById.has(managerId)) return true;
      current = managerId;
    }
  }

  const roots: OrgChartNode[] = [];
  for (const [employeeId, node] of nodesById) {
    const managerId = reportsTo.get(employeeId);
    if (managerId && nodesById.has(managerId) && chainIsAcyclic(employeeId)) {
      nodesById.get(managerId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}
