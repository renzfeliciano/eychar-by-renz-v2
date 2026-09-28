import { describe, it, expect } from "vitest";
import { policyCoverage } from "@/server/policies/policy-coverage";

const NOW = new Date("2026-09-28T00:00:00.000Z");
const policy = (projectId: string | null, status = "active", effectiveTo: string | null = null) => ({
  projectId: projectId ? { toString: () => projectId } : null,
  status,
  effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
});

describe("policyCoverage", () => {
  it("counts policies in force, organization-wide ones, and projects with their own", () => {
    const coverage = policyCoverage(
      [policy(null), policy("p1"), policy("p1"), policy("p2", "inactive"), policy(null, "active", "2026-01-01"), policy("p3")],
      NOW,
    );
    expect(coverage).toEqual({ inForce: 4, orgWide: 1, projectOverrides: 3, projectsWithOwn: 2, retired: 2 });
  });

  it("handles an empty list", () => {
    expect(policyCoverage([], NOW)).toEqual({ inForce: 0, orgWide: 0, projectOverrides: 0, projectsWithOwn: 0, retired: 0 });
  });
});
