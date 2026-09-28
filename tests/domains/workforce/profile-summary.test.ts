import { describe, it, expect } from "vitest";
import { documentExpiry, missingGovernmentIds, profileAtAGlance } from "@/domains/workforce/profile-summary";

const NOW = new Date("2026-09-28T00:00:00.000Z");

describe("documentExpiry", () => {
  it("reads as expired, expiring within 30 days, fine, or not applicable", () => {
    expect(documentExpiry(new Date("2026-09-01"), NOW)).toBe("expired");
    expect(documentExpiry(new Date("2026-10-20"), NOW)).toBe("expiring");
    expect(documentExpiry(new Date("2027-03-01"), NOW)).toBe("valid");
    expect(documentExpiry(null, NOW)).toBe("none");
  });
});

describe("missingGovernmentIds", () => {
  it("lists the government numbers not on file", () => {
    expect(missingGovernmentIds({ sssNumber: "34-1234567-8", philHealthNumber: "", pagIbigNumber: null, tinNumber: "123-456-789" })).toEqual(["PhilHealth", "Pag-IBIG"]);
    expect(missingGovernmentIds(null)).toEqual(["SSS", "PhilHealth", "Pag-IBIG", "TIN"]);
  });
});

describe("profileAtAGlance", () => {
  it("adds up leave left this year, assets still out and documents needing attention", () => {
    const summary = profileAtAGlance(
      {
        year: 2026,
        leave: [
          { year: 2026, available: 5, unlimited: false },
          { year: 2026, available: 2.5, unlimited: false },
          { year: 2026, available: null, unlimited: true },
          { year: 2025, available: 3, unlimited: false },
        ],
        assets: [{ returnedDate: null }, { returnedDate: new Date("2026-01-01") }],
        documents: [{ expiresAt: new Date("2026-09-01") }, { expiresAt: new Date("2026-10-10") }, { expiresAt: null }],
      },
      NOW,
    );
    expect(summary).toEqual({ leaveDaysLeft: 7.5, hasUnlimitedLeave: true, assetsOut: 1, documents: 3, documentsNeedingAttention: 2 });
  });
});
