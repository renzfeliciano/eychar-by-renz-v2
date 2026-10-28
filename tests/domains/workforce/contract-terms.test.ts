import { describe, it, expect } from "vitest";
import { contractEndApplies, contractEndOf, requiresEndOfContract, typesWithoutContractEnd } from "@/domains/workforce/contract-terms";

const TYPES = [
  { code: "regular", metadata: {} },
  { code: "probationary", metadata: { requiresEndOfContract: true, regularizeAfterMonths: 6 } },
  { code: "contractual", metadata: { requiresEndOfContract: true } },
];

describe("contract terms", () => {
  it("reads whether a type ends from its catalog item", () => {
    expect(requiresEndOfContract(TYPES[1])).toBe(true);
    expect(requiresEndOfContract(TYPES[0])).toBe(false);
    expect(requiresEndOfContract(null)).toBe(false);
  });

  it("ignores a leftover end date on a type without one (a Regular employee's contract never ends)", () => {
    expect(contractEndOf({ employmentType: "regular", endOfContract: "2026-11-15" }, TYPES)).toBeNull();
    expect(contractEndOf({ employmentType: "contractual", endOfContract: "2026-11-15" }, TYPES)?.toISOString().slice(0, 10)).toBe("2026-11-15");
    expect(contractEndOf({ employmentType: "contractual" }, TYPES)).toBeNull();
  });

  it("keeps the date for a code the catalog doesn't list, so nothing disappears silently", () => {
    expect(contractEndApplies("seasonal", TYPES)).toBe(true);
    expect(contractEndApplies("regular", [])).toBe(true);
  });

  it("lists the configured types whose end dates never count, for database filters", () => {
    expect(typesWithoutContractEnd(TYPES)).toEqual(["regular"]);
  });
});
