import { describe, it, expect } from "vitest";
import { filterApplicants, daysSince, describeApplied, isHiredStage, stageTone, LEGACY_HIRED_STAGE_CODES } from "@/domains/recruitment/pipeline";
import { DEFAULT_RECRUITMENT_STAGES } from "@/domains/recruitment/default-stages";
import { codesWithFlag } from "@/domains/catalog/catalog-flags";

const applicant = (applicantName: string, positionId: string, positionTitle: string, email?: string) => ({
  applicantName,
  positionId,
  positionTitle,
  email,
  appliedDate: "2026-09-01T00:00:00.000Z",
});

const APPLICANTS = [
  applicant("Maria Santos", "p1", "Security Guard", "maria@example.ph"),
  applicant("Jose Rizal Mercado", "p2", "Janitor"),
  applicant("Ana Reyes", "p1", "Security Guard", "areyes@example.ph"),
];

describe("filterApplicants", () => {
  it("returns everyone with no query and no position", () => {
    expect(filterApplicants(APPLICANTS, {})).toHaveLength(3);
  });

  it("matches the name, email or position, ignoring case and extra spaces", () => {
    expect(filterApplicants(APPLICANTS, { query: "  SANTOS " }).map((a) => a.applicantName)).toEqual(["Maria Santos"]);
    expect(filterApplicants(APPLICANTS, { query: "areyes@" }).map((a) => a.applicantName)).toEqual(["Ana Reyes"]);
    expect(filterApplicants(APPLICANTS, { query: "janitor" }).map((a) => a.applicantName)).toEqual(["Jose Rizal Mercado"]);
  });

  it("narrows to one position, combined with the query", () => {
    expect(filterApplicants(APPLICANTS, { positionId: "p1" })).toHaveLength(2);
    expect(filterApplicants(APPLICANTS, { positionId: "p1", query: "ana" }).map((a) => a.applicantName)).toEqual(["Ana Reyes"]);
  });
});

describe("daysSince / describeApplied", () => {
  const now = new Date("2026-09-28T10:00:00.000Z");

  it("counts whole days, never negative", () => {
    expect(daysSince("2026-09-28T00:00:00.000Z", now)).toBe(0);
    expect(daysSince("2026-09-27T00:00:00.000Z", now)).toBe(1);
    expect(daysSince("2026-09-01T00:00:00.000Z", now)).toBe(27);
    expect(daysSince("2026-10-05T00:00:00.000Z", now)).toBe(0);
  });

  it("reads naturally", () => {
    expect(describeApplied(0)).toBe("Applied today");
    expect(describeApplied(1)).toBe("Applied yesterday");
    expect(describeApplied(6)).toBe("Applied 6 days ago");
    expect(describeApplied(14)).toBe("Applied 2 weeks ago");
    expect(describeApplied(75)).toBe("Applied 2 months ago");
  });
});

describe("stageTone", () => {
  it("marks hired as done, other closing stages as closed, and the rest as open", () => {
    expect(stageTone({ code: "hired", isTerminal: true })).toBe("success");
    expect(stageTone({ code: "rejected", isTerminal: true })).toBe("closed");
    expect(stageTone({ code: "interview" })).toBe("open");
  });
});

describe("default recruitment stages", () => {
  it("close a withdrawn or cancelled application without counting it as a hire", () => {
    const byCode = new Map(DEFAULT_RECRUITMENT_STAGES.map((stage) => [stage.code, stage]));
    for (const code of ["withdrawn_before_start", "withdrawn_after_start", "did_not_proceed"]) {
      const stage = byCode.get(code)!;
      expect(stage.metadata?.isTerminal).toBe(true);
      expect(isHiredStage(stage)).toBe(false);
      expect(stageTone({ code, isTerminal: true, isHired: isHiredStage(stage) })).toBe("closed");
    }
    expect([...codesWithFlag(DEFAULT_RECRUITMENT_STAGES, "isHired", LEGACY_HIRED_STAGE_CODES)]).toEqual(["hired"]);
  });

  it("keep codes unique and in order", () => {
    expect(new Set(DEFAULT_RECRUITMENT_STAGES.map((stage) => stage.code)).size).toBe(DEFAULT_RECRUITMENT_STAGES.length);
    expect(DEFAULT_RECRUITMENT_STAGES.map((stage) => stage.sortOrder)).toEqual([...DEFAULT_RECRUITMENT_STAGES.keys()]);
  });
});
