import { describe, it, expect } from "vitest";
import { formatRelativeDays } from "@/lib/relative-time";

const NOW = new Date("2026-09-28T09:00:00.000Z");

describe("formatRelativeDays", () => {
  it("counts calendar days back from now, in plain words", () => {
    expect(formatRelativeDays("2026-09-28T01:00:00.000Z", NOW)).toBe("Today");
    expect(formatRelativeDays("2026-09-27T23:00:00.000Z", NOW)).toBe("Yesterday");
    expect(formatRelativeDays("2026-09-25T00:00:00.000Z", NOW)).toBe("3 days ago");
    expect(formatRelativeDays("2026-09-07T00:00:00.000Z", NOW)).toBe("3 weeks ago");
    expect(formatRelativeDays("2026-06-01T00:00:00.000Z", NOW)).toBe("3 months ago");
    expect(formatRelativeDays("2024-08-01T00:00:00.000Z", NOW)).toBe("2 years ago");
  });

  it("treats a future date as today", () => {
    expect(formatRelativeDays("2026-10-02T00:00:00.000Z", NOW)).toBe("Today");
  });
});
