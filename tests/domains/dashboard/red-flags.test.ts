import { describe, it, expect } from "vitest";
import { clearanceRedFlags, redFlagTotal } from "@/domains/dashboard/red-flags";

const id = (value: string) => ({ toString: () => value });
const item = (itemId: string, patch: Record<string, unknown> = {}) => ({
  _id: id(itemId),
  title: "Turn over cash collections",
  departmentName: "Accounting",
  status: "flagged",
  amount: 54_000,
  note: "Unremitted cash collections for September",
  actedBy: id("u1"),
  actedAt: new Date("2026-10-20T02:00:00Z"),
  ...patch,
});
const names = (userId: string) => (userId === "u1" ? "Maria Cruz" : undefined);

describe("clearanceRedFlags", () => {
  it("lists each unresolved flagged item with its issue, amount, department and who flagged it", () => {
    const [flag] = clearanceRedFlags([{ _id: id("c1"), employeeName: "Jessa Manadong", status: "in_clearance", items: [item("i1"), item("i2", { status: "cleared" })] }], new Map(), names);
    expect(flag).toMatchObject({
      employeeName: "Jessa Manadong",
      item: "Turn over cash collections",
      issue: "Unremitted cash collections for September",
      amount: 54_000,
      department: "Accounting",
      flaggedBy: "Maria Cruz",
      stage: "no-settlement",
      resolution: "Unresolved · no final settlement yet",
      href: "/clearance/c1",
    });
  });

  it("follows the issue through the final settlement until it's paid out", () => {
    const cases = [{ _id: id("c1"), employeeName: "Jessa", status: "cleared", items: [item("i1")] }];
    const settled = (status: string, deducted = true) => new Map([["c1", { status, lines: deducted ? [{ clearanceItemId: "i1", direction: "deduction" }] : [] }]]);

    expect(clearanceRedFlags(cases, settled("draft"), names)[0]).toMatchObject({ stage: "in-settlement", resolution: "To be deducted from final pay · settlement draft" });
    expect(clearanceRedFlags(cases, settled("draft", false), names)[0]).toMatchObject({ stage: "not-in-settlement", resolution: "Not yet in the final settlement (draft) · recompute it" });
    expect(clearanceRedFlags(cases, settled("approved"), names)[0]).toMatchObject({ stage: "approved", resolution: "Deduction approved · final pay not yet released" });
    expect(clearanceRedFlags(cases, settled("cancelled"), names)[0].stage).toBe("no-settlement");
    expect(clearanceRedFlags(cases, settled("disbursed"), names)).toEqual([]);
  });

  it("leaves out cancelled and closed cases, and says less when settlements can't be seen", () => {
    const cases = [
      { _id: id("c1"), employeeName: "Ana", status: "cancelled", items: [item("i1")] },
      { _id: id("c2"), employeeName: "Ben", status: "closed", items: [item("i2")] },
      { _id: id("c3"), employeeName: "Cara", status: "in_clearance", items: [item("i3", { amount: 0, note: "Laptop charger missing", actedBy: null })] },
    ];
    const flags = clearanceRedFlags(cases, null, names);
    expect(flags.map((flag) => flag.employeeName)).toEqual(["Cara"]);
    expect(flags[0]).toMatchObject({ amount: null, flaggedBy: null, stage: "hidden", resolution: "Unresolved in clearance" });
  });

  it("puts the largest amounts first and totals them", () => {
    const flags = clearanceRedFlags(
      [
        { _id: id("c1"), employeeName: "Ana", status: "in_clearance", items: [item("i1", { amount: 2_500 })] },
        { _id: id("c2"), employeeName: "Ben", status: "in_clearance", items: [item("i2", { amount: 54_000 }), item("i3", { amount: null })] },
      ],
      new Map(),
      names,
    );
    expect(flags.map((flag) => flag.amount)).toEqual([54_000, 2_500, null]);
    expect(redFlagTotal(flags)).toBe(56_500);
  });
});
