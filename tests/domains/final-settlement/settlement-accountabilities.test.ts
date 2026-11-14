import { describe, it, expect } from "vitest";
import { accountabilityDrift, describeDrift } from "@/domains/final-settlement/settlement-accountabilities";

const id = (value: string) => ({ toString: () => value });
const item = (itemId: string, status: string, amount: number | null = null) => ({ _id: id(itemId), title: `Item ${itemId}`, status, amount });
const deduction = (itemId: string, amount: number) => ({ code: "accountability", direction: "deduction", amount, label: `Item ${itemId}: note`, clearanceItemId: itemId });

describe("accountabilityDrift", () => {
  it("is empty when every flagged amount is deducted as flagged", () => {
    const items = [item("a", "flagged", 54_000), item("b", "cleared"), item("c", "flagged", null)];
    const lines = [deduction("a", 54_000), { code: "salary_balance", direction: "earning", amount: 2_400 }];
    expect(accountabilityDrift(items, lines)).toEqual([]);
  });

  it("catches an item flagged after the settlement was computed", () => {
    expect(accountabilityDrift([item("a", "flagged", 54_000)], [])).toEqual([{ itemId: "a", title: "Item a", kind: "missing", flaggedAmount: 54_000, deductedAmount: null }]);
  });

  it("catches a flagged amount changed after the settlement was computed", () => {
    const [drift] = accountabilityDrift([item("a", "flagged", 56_000)], [deduction("a", 54_000)]);
    expect(drift).toMatchObject({ kind: "amount-changed", flaggedAmount: 56_000, deductedAmount: 54_000 });
    expect(describeDrift(drift)).toBe("Item a: flagged at ₱56,000.00 but deducted at ₱54,000.00");
  });

  it("catches a deduction whose item was since cleared, waived or removed", () => {
    const drift = accountabilityDrift([item("a", "waived", 54_000)], [deduction("a", 54_000), deduction("gone", 1_000)]);
    expect(drift.map((entry) => [entry.itemId, entry.kind])).toEqual([
      ["a", "no-longer-flagged"],
      ["gone", "no-longer-flagged"],
    ]);
    expect(describeDrift(drift[0])).toBe("Item a: deducted ₱54,000.00 but no longer flagged");
  });

  it("ignores sub-centavo differences", () => {
    expect(accountabilityDrift([item("a", "flagged", 100.004)], [deduction("a", 100)])).toEqual([]);
  });
});
