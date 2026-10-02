import { describe, it, expect } from "vitest";
import { catalogFlag, codesWithFlag } from "@/domains/catalog/catalog-flags";
import { closedCaseCodes, filterCasesByView, isOpenCase, summarizeCases } from "@/domains/cases/case-summary";
import { isHiredStage, stageTone } from "@/domains/recruitment/pipeline";

const LEGACY = new Set(["closed"]);

describe("catalogFlag", () => {
  it("reads the item's boolean flag, which beats the legacy code list", () => {
    expect(catalogFlag({ code: "won", metadata: { isClosed: true } }, "isClosed", LEGACY)).toBe(true);
    expect(catalogFlag({ code: "closed", metadata: { isClosed: false } }, "isClosed", LEGACY)).toBe(false);
  });

  it("falls back to the legacy codes only for items without the flag", () => {
    expect(catalogFlag({ code: "closed", metadata: {} }, "isClosed", LEGACY)).toBe(true);
    expect(catalogFlag({ code: "closed" }, "isClosed", LEGACY)).toBe(true);
    expect(catalogFlag({ code: "ongoing", metadata: { isClosed: "yes" } }, "isClosed", LEGACY)).toBe(false);
    expect(catalogFlag({ code: "ongoing" }, "isClosed")).toBe(false);
  });

  it("keeps legacy codes that have no catalog item", () => {
    expect([...codesWithFlag([{ code: "won", metadata: { isClosed: true } }], "isClosed", LEGACY)].sort()).toEqual(["closed", "won"]);
    expect([...codesWithFlag([{ code: "closed", metadata: { isClosed: false } }], "isClosed", LEGACY)]).toEqual([]);
  });
});

describe("case statuses: isClosed", () => {
  const CASES = [
    { status: "ongoing", classification: "labor", projectId: "p1" },
    { status: "dismissed", classification: "labor", projectId: "p1" },
    { status: "won", classification: "civil", projectId: "p2" },
  ];

  it("keeps today's answer for the seeded statuses without the flag", () => {
    const closed = closedCaseCodes([{ code: "ongoing" }, { code: "dismissed" }]);
    for (const code of ["dismissed", "closed", "resolved", "settled"]) expect(isOpenCase(code, closed)).toBe(false);
    expect(isOpenCase("ongoing", closed)).toBe(true);
  });

  it("closes a status the organization flagged, and reopens one it unflagged", () => {
    const closed = closedCaseCodes([{ code: "won", metadata: { isClosed: true } }, { code: "dismissed", metadata: { isClosed: false } }]);
    expect(isOpenCase("won", closed)).toBe(false);
    expect(isOpenCase("dismissed", closed)).toBe(true);
    expect(summarizeCases(CASES, new Date(), closed)).toMatchObject({ open: 2, closed: 1 });
    expect(filterCasesByView(CASES, "closed", closed).map((item) => item.status)).toEqual(["won"]);
  });
});

describe("recruitment stages: isHired", () => {
  it("treats the seeded hired stage as a hire until it's flagged otherwise", () => {
    expect(isHiredStage({ code: "hired", metadata: { isTerminal: true } })).toBe(true);
    expect(isHiredStage({ code: "hired", metadata: { isTerminal: true, isHired: false } })).toBe(false);
    expect(isHiredStage({ code: "onboarded", metadata: { isTerminal: true, isHired: true } })).toBe(true);
    expect(isHiredStage({ code: "rejected", metadata: { isTerminal: true } })).toBe(false);
  });

  it("colours a flagged hire stage as the good outcome, whatever its code", () => {
    expect(stageTone({ code: "onboarded", isTerminal: true, isHired: true })).toBe("success");
    expect(stageTone({ code: "hired", isTerminal: true, isHired: false })).toBe("closed");
  });
});
