import { describe, it, expect } from "vitest";
import { evaluateSource, type SourceFacts } from "@/domains/clearance/clearance-sources";

const FACTS: SourceFacts = {
  unreturnedAssets: [{ id: "a1", label: "Dell Latitude 5440 (SN-123)" }],
  unfinishedTravel: [{ id: "t1", label: "Oct 2 – Oct 5, 2026 (ongoing)" }],
  activeAccounts: [{ id: "u1", label: "ana.reyes" }],
};
const NONE: SourceFacts = { unreturnedAssets: [], unfinishedTravel: [], activeAccounts: [] };

describe("evaluateSource", () => {
  it("assets: satisfied only when nothing issued is still out, listing what is", () => {
    expect(evaluateSource("assets", FACTS)).toEqual({ satisfied: false, autoClears: true, summary: "1 asset still issued", details: ["Dell Latitude 5440 (SN-123)"] });
    expect(evaluateSource("assets", NONE)).toMatchObject({ satisfied: true, autoClears: true, summary: "All issued assets returned" });
  });

  it("account access: satisfied once every account for the employee is disabled", () => {
    expect(evaluateSource("account_access", FACTS)).toMatchObject({ satisfied: false, autoClears: true, summary: "1 account still active", details: ["ana.reyes"] });
    expect(evaluateSource("account_access", NONE)).toMatchObject({ satisfied: true, summary: "No active accounts" });
  });

  it("travel orders: shown for reference only, never cleared automatically (advances can't be verified)", () => {
    expect(evaluateSource("travel_orders", FACTS)).toMatchObject({ autoClears: false, summary: "1 travel order not finished", details: ["Oct 2 – Oct 5, 2026 (ongoing)"] });
    expect(evaluateSource("travel_orders", NONE)).toMatchObject({ autoClears: false, summary: "No unfinished travel orders" });
  });
});
