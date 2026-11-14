import { describe, it, expect } from "vitest";
import { filterComplaints, isClosedStage, withOrphanedStages } from "@/domains/complaints/pipeline";

const complaints = [
  { irNumber: "IR-0001", respondentName: "Juan Dela Cruz" },
  { irNumber: "IR-0002", respondentName: "Maria Santos" },
  { irNumber: "IR-0012", respondentName: "Pedro Reyes" },
];

describe("filterComplaints", () => {
  it("returns every complaint for a blank query", () => {
    expect(filterComplaints(complaints, {})).toEqual(complaints);
    expect(filterComplaints(complaints, { query: "   " })).toEqual(complaints);
  });

  it("finds a respondent by words in any order, ignoring case", () => {
    expect(filterComplaints(complaints, { query: "CRUZ juan" }).map((complaint) => complaint.irNumber)).toEqual(["IR-0001"]);
  });

  it("finds a complaint by its IR number", () => {
    expect(filterComplaints(complaints, { query: "ir-0012" }).map((complaint) => complaint.respondentName)).toEqual(["Pedro Reyes"]);
  });

  it("returns nothing when no word matches", () => {
    expect(filterComplaints(complaints, { query: "nobody" })).toEqual([]);
  });
});

describe("isClosedStage", () => {
  it("is true only when the stage is flagged terminal", () => {
    expect(isClosedStage({ metadata: { isTerminal: true } })).toBe(true);
    expect(isClosedStage({ metadata: { isTerminal: false } })).toBe(false);
    expect(isClosedStage({ metadata: {} })).toBe(false);
    expect(isClosedStage({})).toBe(false);
  });
});

describe("withOrphanedStages", () => {
  const stages = [
    { code: "received", name: "Received IR/complaint" },
    { code: "sanction", name: "Sanction" },
  ];

  it("leaves the stages alone when every complaint sits in a configured one", () => {
    expect(withOrphanedStages(stages, [{ stage: "received" }, { stage: "sanction" }])).toEqual(stages);
  });

  it("adds one column, once, for a stage a complaint still uses but the catalog no longer lists", () => {
    const result = withOrphanedStages(stages, [{ stage: "retired_stage" }, { stage: "retired_stage" }, { stage: "received" }]);
    expect(result).toEqual([...stages, { code: "retired_stage", name: "retired_stage" }]);
  });
});
