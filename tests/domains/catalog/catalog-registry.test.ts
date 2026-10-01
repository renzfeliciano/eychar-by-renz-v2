import { describe, it, expect } from "vitest";
import { isCatalogTypeSlug } from "@/domains/catalog/catalog-registry";

describe("isCatalogTypeSlug", () => {
  it("accepts registered catalog slugs", () => {
    expect(isCatalogTypeSlug("payment-methods")).toBe(true);
    expect(isCatalogTypeSlug("attendance-statuses")).toBe(true);
  });

  it("rejects inherited object keys, so they read as an unknown catalog (400) rather than crashing", () => {
    for (const key of ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf", "nope"]) expect(isCatalogTypeSlug(key)).toBe(false);
  });
});
