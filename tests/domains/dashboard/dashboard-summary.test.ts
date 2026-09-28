import { describe, it, expect } from "vitest";
import { buildAttentionItems, greetingFor, upcomingEvents, attendanceSegments } from "@/domains/dashboard/dashboard-summary";

describe("greetingFor", () => {
  it("greets by the time of day", () => {
    expect(greetingFor(0)).toBe("Good morning");
    expect(greetingFor(11)).toBe("Good morning");
    expect(greetingFor(12)).toBe("Good afternoon");
    expect(greetingFor(17)).toBe("Good afternoon");
    expect(greetingFor(18)).toBe("Good evening");
    expect(greetingFor(23)).toBe("Good evening");
  });
});

describe("buildAttentionItems", () => {
  it("returns nothing when every queue is empty or not visible to the user", () => {
    expect(buildAttentionItems({})).toEqual([]);
    expect(buildAttentionItems({ pendingLeave: 0, payrollSubmitted: 0, openCases: 0 })).toEqual([]);
  });

  it("lists only non-zero queues, most urgent first, each linking to where it's resolved", () => {
    const items = buildAttentionItems({
      openCases: 2,
      missingGovernmentIds: 4,
      pendingLeave: 3,
      payrollSubmitted: 1,
      payrollApproved: 1,
      payrollDrafts: 0,
    });

    expect(items.map((item) => item.key)).toEqual(["payrollApproved", "payrollSubmitted", "pendingLeave", "missingGovernmentIds", "openCases"]);
    expect(items.map((item) => item.count)).toEqual([1, 1, 3, 4, 2]);
    expect(items[0].href).toBe("/payroll?status=approved");
    expect(items[1].href).toBe("/payroll?status=submitted");
    expect(items[2].href).toBe("/leave?status=pending");
    for (const item of items) {
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.description.length).toBeGreaterThan(0);
    }
  });

  it("marks decisions as warnings and records that block payroll as danger", () => {
    const items = buildAttentionItems({ pendingLeave: 1, missingPayTerms: 2, payrollDrafts: 5 });
    const toneOf = (key: string) => items.find((item) => item.key === key)?.tone;
    expect(toneOf("pendingLeave")).toBe("warning");
    expect(toneOf("missingPayTerms")).toBe("danger");
    expect(toneOf("payrollDrafts")).toBe("info");
  });
});

describe("upcomingEvents", () => {
  const event = (title: string, date: string, status = "active") => ({ title, date: new Date(`${date}T00:00:00.000Z`), status });

  it("keeps active events from today on, soonest first, up to the limit", () => {
    const events = [event("Town hall", "2026-09-30"), event("Past", "2026-09-27"), event("Today", "2026-09-28"), event("Cancelled", "2026-09-29", "cancelled"), event("Later", "2026-10-05")];
    expect(upcomingEvents(events, "2026-09-28", 2).map((item) => item.title)).toEqual(["Today", "Town hall"]);
    expect(upcomingEvents(events, "2026-09-28", 10).map((item) => item.title)).toEqual(["Today", "Town hall", "Later"]);
  });
});

describe("attendanceSegments", () => {
  it("gives each status its share of the day, in a fixed order, dropping empty ones", () => {
    const segments = attendanceSegments({ present: 5, late: 1, absent: 0, onLeave: 2, notRecorded: 2 });
    expect(segments.map((segment) => segment.key)).toEqual(["present", "late", "onLeave", "notRecorded"]);
    expect(segments.map((segment) => segment.share)).toEqual([50, 10, 20, 20]);
  });

  it("returns no segments when there is no one to count", () => {
    expect(attendanceSegments({ present: 0, late: 0, absent: 0, onLeave: 0, notRecorded: 0 })).toEqual([]);
  });
});
