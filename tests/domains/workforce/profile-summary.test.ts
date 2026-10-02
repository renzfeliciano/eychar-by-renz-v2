import { describe, it, expect } from "vitest";
import { documentExpiry, missingGovernmentIds, profileAttention } from "@/domains/workforce/profile-summary";

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

describe("profileAttention", () => {
  const base = { active: true, hasPosition: true, missingIds: [], hasSelfServiceLogin: true, hasPayTerms: true };

  it("is empty for someone with everything in order", () => {
    expect(profileAttention(base, NOW)).toEqual([]);
  });

  it("puts the urgent things first", () => {
    const items = profileAttention(
      {
        ...base,
        missingIds: ["TIN"],
        pendingLeave: 2,
        contractEnd: new Date("2026-10-10T00:00:00.000Z"),
        openClearance: { lastWorkingDay: new Date("2026-10-01T00:00:00.000Z") },
        documents: [{ title: "NBI clearance", expiresAt: new Date("2026-09-01T00:00:00.000Z") }],
      },
      NOW,
    );
    expect(items.map((item) => item.tone)).toEqual(["danger", "danger", "warning", "warning", "info"]);
    expect(items[0].text).toBe("Leaving: last working day in 3 days. Clearance is open.");
    expect(items.find((item) => item.key === "contract")?.text).toBe("Contract ends in 12 days: renew, regularize or start clearance.");
    expect(items.find((item) => item.key === "leave")?.text).toBe("2 leave requests waiting for a decision.");
  });

  it("flags a contract that ended while they're still active", () => {
    expect(profileAttention({ ...base, contractEnd: new Date("2026-09-20T00:00:00.000Z") }, NOW)[0]).toMatchObject({ tone: "danger", tab: "job" });
  });

  it("skips what the viewer can't see, and active-only checks for people who left", () => {
    expect(profileAttention({ ...base, active: false, hasPosition: false, hasSelfServiceLogin: false, hasPayTerms: false }, NOW)).toEqual([]);
    expect(profileAttention({ ...base, hasPayTerms: undefined }, NOW)).toEqual([]);
  });
});
