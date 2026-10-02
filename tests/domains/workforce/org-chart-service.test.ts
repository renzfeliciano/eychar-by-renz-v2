import { describe, it, expect, beforeEach } from "vitest";
import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, PersonModel, EmployeeModel, EmployeeAssignmentModel, OrgChartModel, AuditLogModel } from "@/server/db/models";
import { OrgChartService } from "@/domains/workforce/org-chart-service";
import type { SaveOrgChartInput } from "@/shared/validation/org-chart";

type ChartNode = SaveOrgChartInput["nodes"][number];

async function seedEmployee(organizationId: Types.ObjectId, suffix: string) {
  const person = await PersonModel.create({ organizationId, firstName: `First${suffix}`, lastName: `Last${suffix}` });
  return EmployeeModel.create({ organizationId, personId: person._id, employeeNumber: `EMP-${suffix}-${Date.now()}-${Math.random()}` });
}

async function seedOrg() {
  const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-chart-${Date.now()}-${Math.random()}` });
  const [boss, ana, ben] = await Promise.all(["BOSS", "ANA", "BEN"].map((suffix) => seedEmployee(organization._id, suffix)));
  return { orgId: organization._id.toString(), organization, boss, ana, ben };
}

/** Old data still carries `reportsToEmployeeId` (written before ADR-046); the model no longer knows the field. */
async function legacyAssignment(organizationId: Types.ObjectId, employeeId: Types.ObjectId, reportsTo?: Types.ObjectId) {
  await EmployeeAssignmentModel.collection.insertOne({ organizationId, employeeId, reportsToEmployeeId: reportsTo, effectiveFrom: new Date("2026-01-01"), status: "active" });
}

const person = (key: string, employeeId: string, x = 0, y = 0): ChartNode => ({ key, type: "person", employeeId, x, y });

describe("OrgChartService", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("first visit: builds the chart from the old reports-to links, unsaved", async () => {
    const s = await seedOrg();
    await legacyAssignment(s.organization._id, s.boss._id);
    await legacyAssignment(s.organization._id, s.ana._id, s.boss._id);
    await legacyAssignment(s.organization._id, s.ben._id, s.boss._id);

    const chart = await OrgChartService.get(s.orgId);
    expect(chart.saved).toBe(false);
    expect(chart.nodes).toHaveLength(3);
    const keyOf = (id: Types.ObjectId) => chart.nodes.find((node) => node.employeeId === id.toString())!.key;
    // Two people under one person.
    expect(chart.edges).toEqual(expect.arrayContaining([{ from: keyOf(s.boss._id), to: keyOf(s.ana._id) }, { from: keyOf(s.boss._id), to: keyOf(s.ben._id) }]));
    expect(chart.edges).toHaveLength(2);
    // Arranged as a tree: the boss sits above both.
    const y = (id: Types.ObjectId) => chart.nodes.find((node) => node.employeeId === id.toString())!.y;
    expect(y(s.boss._id)).toBeLessThan(y(s.ana._id));
    expect(y(s.ana._id)).toBe(y(s.ben._id));
  });

  it("first visit: breaks a loop in old data instead of failing", async () => {
    const s = await seedOrg();
    await legacyAssignment(s.organization._id, s.ana._id, s.ben._id);
    await legacyAssignment(s.organization._id, s.ben._id, s.ana._id);

    const chart = await OrgChartService.get(s.orgId);
    expect(chart.edges.length).toBeLessThan(2);
  });

  it("saves the canvas whole, audits it, and returns it on the next visit", async () => {
    const s = await seedOrg();
    const group: ChartNode = { key: "g1", type: "group", label: "Operations", color: "violet", x: 0, y: 0 };
    await OrgChartService.save(
      {
        organizationId: s.orgId,
        nodes: [group, person("b", s.boss._id.toString(), 0, 120), person("a", s.ana._id.toString(), -120, 240), person("n", s.ben._id.toString(), 120, 240)],
        edges: [{ from: "g1", to: "b" }, { from: "b", to: "a" }, { from: "b", to: "n" }],
      },
      {},
    );

    const chart = await OrgChartService.get(s.orgId);
    expect(chart.saved).toBe(true);
    expect(chart.nodes.find((node) => node.key === "g1")).toMatchObject({ type: "group", label: "Operations", color: "violet" });
    expect(chart.edges).toHaveLength(3);
    expect(await AuditLogModel.exists({ organizationId: s.organization._id, action: "org-chart.updated" })).toBeTruthy();
  });

  it("rejects a loop", async () => {
    const s = await seedOrg();
    await expect(
      OrgChartService.save(
        { organizationId: s.orgId, nodes: [person("a", s.ana._id.toString()), person("b", s.ben._id.toString())], edges: [{ from: "a", to: "b" }, { from: "b", to: "a" }] },
        {},
      ),
    ).rejects.toThrow();
    expect(await OrgChartModel.exists({ organizationId: s.organization._id })).toBeNull();
  });

  it("rejects someone from another organization", async () => {
    const s = await seedOrg();
    const other = await seedOrg();
    await expect(
      OrgChartService.save({ organizationId: s.orgId, nodes: [person("x", other.ana._id.toString())], edges: [] }, {}),
    ).rejects.toThrow(/isn't an employee of this organization/);
  });

  it("drops the card of a deleted employee, and the lines to it", async () => {
    const s = await seedOrg();
    await OrgChartService.save(
      { organizationId: s.orgId, nodes: [person("b", s.boss._id.toString()), person("a", s.ana._id.toString())], edges: [{ from: "b", to: "a" }] },
      {},
    );
    await EmployeeModel.deleteOne({ _id: s.ana._id });

    const chart = await OrgChartService.get(s.orgId);
    expect(chart.nodes.map((node) => node.key)).toEqual(["b"]);
    expect(chart.edges).toEqual([]);
  });
});
