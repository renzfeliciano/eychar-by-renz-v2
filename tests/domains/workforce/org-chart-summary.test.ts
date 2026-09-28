import { describe, it, expect } from "vitest";
import type { OrgChartNode } from "@/domains/workforce/org-chart-service";
import { summarizeOrgChart, teamSize, flattenOrgChart, findPath, collapsedBeyondDepth } from "@/domains/workforce/org-chart-summary";

const node = (employeeId: string, children: OrgChartNode[] = [], organizationUnitName: string | null = null): OrgChartNode => ({
  employeeId,
  name: employeeId.toUpperCase(),
  employmentStatus: "active",
  positionTitle: null,
  organizationUnitName,
  projectName: null,
  children,
});

// president → (ops → (guard1, guard2), finance) ; plus a second root with nobody under them.
const TREE = [node("president", [node("ops", [node("guard1", [], "Security"), node("guard2", [], "Security")], "Operations"), node("finance", [], "Finance")], "Executive"), node("loner")];

describe("org chart summary", () => {
  it("counts people, managers, people without a manager, the largest team and the depth", () => {
    expect(summarizeOrgChart(TREE)).toEqual({ people: 6, managers: 2, topLevel: 2, largestTeam: 2, levels: 3 });
  });

  it("counts everyone under a person, not just direct reports", () => {
    expect(teamSize(TREE[0])).toBe(4);
    expect(teamSize(TREE[1])).toBe(0);
  });

  it("flattens to rows with depth and manager, in chart order", () => {
    const rows = flattenOrgChart(TREE);
    expect(rows.map((row) => `${row.node.employeeId}@${row.depth}`)).toEqual(["president@0", "ops@1", "guard1@2", "guard2@2", "finance@1", "loner@0"]);
    expect(rows.find((row) => row.node.employeeId === "guard1")?.managerName).toBe("OPS");
  });

  it("finds the chain of managers above someone", () => {
    expect(findPath(TREE, "guard2")?.map((item) => item.employeeId)).toEqual(["president", "ops", "guard2"]);
    expect(findPath(TREE, "nobody")).toBeNull();
  });

  it("collapses everyone below a depth, so big charts open readable", () => {
    expect([...collapsedBeyondDepth(TREE, 1)]).toEqual(["ops"]);
    expect([...collapsedBeyondDepth(TREE, 0)].sort()).toEqual(["ops", "president"]);
  });
});
