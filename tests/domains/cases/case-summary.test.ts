import { describe, it, expect } from "vitest";
import { isOpenCase, summarizeCases, filterCasesByView, CASE_STALE_DAYS } from "@/domains/cases/case-summary";

const NOW = new Date("2026-09-28T00:00:00.000Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);

const CASES = [
  { status: "mediation", classification: "labor", projectId: "p1", updatedAt: daysAgo(3) },
  { status: "filed", classification: "labor", projectId: "p1", updatedAt: daysAgo(CASE_STALE_DAYS + 5) },
  { status: "filed", classification: "civil", projectId: "p2", updatedAt: daysAgo(10) },
  { status: "dismissed", classification: "labor", projectId: "p2", updatedAt: daysAgo(400) },
  { status: "settled", classification: "civil", projectId: "p1", updatedAt: daysAgo(20) },
];

describe("isOpenCase", () => {
  it("treats dismissed, closed, resolved and settled as closed", () => {
    for (const status of ["dismissed", "closed", "resolved", "settled"]) expect(isOpenCase(status)).toBe(false);
    for (const status of ["filed", "mediation", "hearing"]) expect(isOpenCase(status)).toBe(true);
  });
});

describe("summarizeCases", () => {
  it("counts open and closed, groups open cases by classification and project (largest first), and flags stale ones", () => {
    const summary = summarizeCases(CASES, NOW);
    expect(summary.open).toBe(3);
    expect(summary.closed).toBe(2);
    expect(summary.stale).toBe(1);
    expect(summary.byClassification).toEqual([
      { key: "labor", count: 2 },
      { key: "civil", count: 1 },
    ]);
    expect(summary.byProject).toEqual([
      { key: "p1", count: 2 },
      { key: "p2", count: 1 },
    ]);
  });
});

describe("filterCasesByView", () => {
  it("filters by open, closed, a specific status, or nothing", () => {
    expect(filterCasesByView(CASES, "all")).toHaveLength(5);
    expect(filterCasesByView(CASES, "open")).toHaveLength(3);
    expect(filterCasesByView(CASES, "closed")).toHaveLength(2);
    expect(filterCasesByView(CASES, "filed")).toHaveLength(2);
  });
});
