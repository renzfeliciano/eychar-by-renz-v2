import { randomUUID } from "crypto";
import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { EmployeeAssignmentModel, EmployeeModel, OrgChartModel } from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
import { ValidationError } from "@/shared/errors";
import { formatPersonName } from "@/lib/person-name";
import { EmployeeService } from "./employee-service";
import { PositionService } from "@/domains/organization/position-service";
import { ProjectService } from "@/domains/organization/project-service";
import { EmploymentStatusService } from "@/domains/catalog/employment-status-service";
import { arrange, chartProblems, type ChartEdge, type ChartNode } from "./org-chart-tree";
import type { SaveOrgChartInput } from "@/shared/validation/org-chart";

/** Someone who can be placed on the chart, with what the card shows. */
export type ChartPerson = { employeeId: string; name: string; employeeNumber: string | null; positionTitle: string | null; projectName: string | null; current: boolean };

export type OrgChartView = {
  nodes: ChartNode[];
  edges: ChartEdge[];
  people: ChartPerson[];
  /** False until someone saves: the chart was built from the old "reports to" links. */
  saved: boolean;
  updatedAt: string | null;
};

const toNode = (node: { key: string; type: string; employeeId?: Types.ObjectId | null; label?: string | null; color?: string | null; x: number; y: number }): ChartNode => ({
  key: node.key,
  type: node.type as ChartNode["type"],
  employeeId: node.employeeId?.toString(),
  label: node.label ?? undefined,
  color: node.color ?? undefined,
  x: node.x,
  y: node.y,
});

/**
 * The org chart HR draws on a free canvas (ADR-046). Saved whole, one per
 * organization. Until the first save it starts from the links the old
 * "reports to" field held, so nobody loses the structure they already had.
 */
export const OrgChartService = {
  async get(organizationId: string): Promise<OrgChartView> {
    await connectMongoDB();
    const orgObjectId = new Types.ObjectId(organizationId);
    const [roster, positions, projects, statuses, chart] = await Promise.all([
      EmployeeService.listWithCurrentStatus(organizationId),
      PositionService.listCurrent(organizationId),
      ProjectService.listCurrent(organizationId),
      EmploymentStatusService.listCurrent(organizationId),
      OrgChartModel.findOne({ organizationId: orgObjectId }).lean<{ nodes: Parameters<typeof toNode>[0][]; edges: ChartEdge[]; updatedAt?: Date } | null>(),
    ]);
    const positionTitle = new Map(positions.map((position) => [position._id.toString(), position.title]));
    const projectName = new Map(projects.map((project) => [project._id.toString(), project.name]));
    const activeCodes = new Set(statuses.filter((status) => status.metadata?.isActiveHeadcount).map((status) => status.code));
    const people: ChartPerson[] = roster
      .map((row) => ({
        employeeId: row._id.toString(),
        name: row.person ? formatPersonName(row.person) : (row.employeeNumber ?? "Employee"),
        employeeNumber: row.employeeNumber ?? null,
        positionTitle: row.currentAssignment?.positionId ? (positionTitle.get(row.currentAssignment.positionId.toString()) ?? null) : null,
        projectName: row.currentAssignment?.projectId ? (projectName.get(row.currentAssignment.projectId.toString()) ?? null) : null,
        current: activeCodes.size === 0 || activeCodes.has(row.currentEmployment?.status ?? ""),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const known = new Set(people.map((person) => person.employeeId));

    if (chart) {
      // Cards of employees since deleted drop out, and so do lines to them.
      const nodes = chart.nodes.map(toNode).filter((node) => node.type === "group" || (node.employeeId && known.has(node.employeeId)));
      const keys = new Set(nodes.map((node) => node.key));
      const edges = chart.edges.filter((edge) => keys.has(edge.from) && keys.has(edge.to)).map((edge) => ({ from: edge.from, to: edge.to }));
      return { nodes, edges, people, saved: true, updatedAt: chart.updatedAt ? new Date(chart.updatedAt).toISOString() : null };
    }

    // First visit: current staff as cards, linked the way "reports to" had them.
    const legacy = await EmployeeAssignmentModel.collection
      .find({ organizationId: orgObjectId, $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: null }] }, { projection: { employeeId: 1, reportsToEmployeeId: 1 } })
      .toArray();
    const keyOf = new Map<string, string>();
    const nodes: ChartNode[] = people
      .filter((person) => person.current)
      .map((person, index) => {
        const key = `p-${person.employeeId}`;
        keyOf.set(person.employeeId, key);
        return { key, type: "person" as const, employeeId: person.employeeId, x: index * 10, y: 0 };
      });
    let edges: ChartEdge[] = [];
    for (const row of legacy) {
      const child = keyOf.get(String(row.employeeId));
      const parent = row.reportsToEmployeeId ? keyOf.get(String(row.reportsToEmployeeId)) : undefined;
      if (child && parent && child !== parent && !edges.some((edge) => edge.to === child)) edges.push({ from: parent, to: child });
    }
    // Old data could hold a loop; drop links until it's a tree.
    while (chartProblems(nodes, edges).length && edges.length) edges = edges.slice(0, -1);
    return { nodes: arrange(nodes, edges), edges, people, saved: false, updatedAt: null };
  },

  async save(input: SaveOrgChartInput, actor: { userId?: string }) {
    await connectMongoDB();
    const orgObjectId = new Types.ObjectId(input.organizationId);
    const problems = chartProblems(input.nodes, input.edges);
    if (problems.length) throw new ValidationError(problems.join(". "));

    const employeeIds = [...new Set(input.nodes.flatMap((node) => (node.type === "person" && node.employeeId ? [node.employeeId] : [])))];
    const found = await EmployeeModel.countDocuments({ _id: { $in: employeeIds.map((id) => new Types.ObjectId(id)) }, organizationId: orgObjectId });
    if (found !== employeeIds.length) throw new ValidationError("Someone on the chart isn't an employee of this organization");

    const before = await OrgChartModel.findOne({ organizationId: orgObjectId }).select("nodes edges").lean<{ nodes: unknown[]; edges: unknown[] } | null>();
    const chart = await OrgChartModel.findOneAndUpdate(
      { organizationId: orgObjectId },
      {
        $set: {
          nodes: input.nodes.map((node) => ({
            key: node.key,
            type: node.type,
            employeeId: node.type === "person" ? new Types.ObjectId(node.employeeId) : undefined,
            label: node.type === "group" ? node.label : undefined,
            color: node.color,
            x: Math.round(node.x),
            y: Math.round(node.y),
          })),
          edges: input.edges,
          updatedBy: actor.userId ? new Types.ObjectId(actor.userId) : undefined,
        },
      },
      { upsert: true, new: true },
    ).lean<{ _id: Types.ObjectId; updatedAt?: Date }>();

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "org-chart.updated",
      resourceType: "OrgChart",
      resourceId: chart!._id.toString(),
      before: before ? { cards: before.nodes.length, links: before.edges.length } : null,
      after: { cards: input.nodes.length, links: input.edges.length },
    });
    return chart;
  },

  /** A fresh card key (the browser makes its own; this is for the server side). */
  newKey(): string {
    return `n-${randomUUID().slice(0, 12)}`;
  },
};
