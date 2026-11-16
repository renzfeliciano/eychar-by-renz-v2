import { describe, it, expect } from "vitest";
import { expiryStatus } from "@/domains/people/expiry-status";

const today = "2026-11-16";

describe("expiryStatus", () => {
  it("is null when there is no date, so nothing is flagged", () => {
    expect(expiryStatus(null, today)).toBeNull();
    expect(expiryStatus(undefined, today)).toBeNull();
    expect(expiryStatus("", today)).toBeNull();
  });

  it("is expired only for a date before today", () => {
    expect(expiryStatus("2026-11-15", today)).toBe("expired");
    expect(expiryStatus("2020-01-01", today)).toBe("expired");
  });

  it("treats today as expiring soon, not expired", () => {
    expect(expiryStatus("2026-11-16", today)).toBe("expiring");
  });

  it("is expiring through day 30 and valid from day 31", () => {
    expect(expiryStatus("2026-12-16", today)).toBe("expiring");
    expect(expiryStatus("2026-12-17", today)).toBe("valid");
  });
});
