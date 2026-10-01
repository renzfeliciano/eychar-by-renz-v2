import { describe, it, expect } from "vitest";
import { APP_TIME_ZONE, clockTime, appDateKey, minutesOfDayInAppZone, hourInAppZone, zonedInstant } from "@/lib/app-time";
import { computeStatus } from "@/domains/attendance/attendance-service";

// These hold whatever timezone the server runs in (Vercel runs UTC; a dev PC may run UTC+8).
describe("app time (Asia/Manila)", () => {
  it("defaults to the Philippines", () => {
    expect(APP_TIME_ZONE).toBe("Asia/Manila");
  });

  it("shows a stored instant as Manila clock time", () => {
    // Renzy's real check-in: 12:27 PM in Manila, stored as 04:27 UTC.
    expect(clockTime(new Date("2026-10-01T04:27:43.666Z"))).toBe("12:27");
    expect(clockTime(new Date("2026-10-01T00:00:00.000Z"))).toBe("08:00");
    expect(minutesOfDayInAppZone(new Date("2026-10-01T04:27:43.666Z"))).toBe(12 * 60 + 27);
    expect(hourInAppZone(new Date("2026-10-01T04:27:43.666Z"))).toBe(12);
  });

  it("uses Manila's calendar for today: just after midnight there is still the previous day in UTC", () => {
    expect(appDateKey(new Date("2026-09-30T16:30:00.000Z"))).toBe("2026-10-01");
    expect(appDateKey(new Date("2026-09-30T15:30:00.000Z"))).toBe("2026-09-30");
  });

  it("turns a Manila date and time typed by HR into the right instant", () => {
    expect(zonedInstant("2026-10-01", "08:00").toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(zonedInstant("2026-10-01", "00:30").toISOString()).toBe("2026-09-30T16:30:00.000Z");
  });

  it("judges lateness against Manila time, not the server's", () => {
    const policy = { standardStartTime: "09:00", gracePeriodMinutes: 15 };
    expect(computeStatus(new Date("2026-10-01T01:10:00.000Z"), policy)).toBe("present"); // 9:10 AM
    expect(computeStatus(new Date("2026-10-01T04:27:00.000Z"), policy)).toBe("late"); // 12:27 PM
  });
});
