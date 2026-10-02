import { describe, it, expect } from "vitest";
import { APP_TIME_ZONE, clockTime, appDateKey, minutesOfDayInAppZone, hourInAppZone, zonedInstant, formatDate, formatDateTime, formatTime } from "@/lib/app-time";
import { formatCalendarDate } from "@/lib/date-key";
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

describe("display formatting in the organization's time zone", () => {
  // 16:30 UTC on Sep 30 is 00:30 on Oct 1 in Manila: a UTC server would print the wrong day and time.
  const instant = new Date("2026-09-30T16:30:05.000Z");

  it("formats instants on Manila's clock, whatever the server's zone", () => {
    expect(formatDateTime(instant)).toBe("Oct 1, 2026, 12:30 AM");
    expect(formatDateTime(instant, "seconds")).toBe("Oct 1, 2026, 12:30:05 AM");
    expect(formatDateTime(instant, "short")).toBe("Oct 1, 12:30 AM");
    expect(formatDateTime(instant, "long")).toBe("October 1, 2026 at 12:30 AM");
    expect(formatDateTime(instant.toISOString())).toBe("Oct 1, 2026, 12:30 AM");
  });

  it("always applies the app time zone, even when the caller's options name another", () => {
    expect(formatDateTime(instant, { hour: "numeric", minute: "2-digit", timeZone: "UTC" })).toBe("12:30 AM");
  });

  it("gives an instant's calendar day and time there", () => {
    expect(formatDate(instant)).toBe("Oct 1, 2026");
    expect(formatDate(instant, { weekday: "long", month: "long", day: "numeric" })).toBe("Thursday, October 1");
    expect(formatTime(instant)).toBe("12:30 AM");
    expect(formatTime("2026-10-01T04:27:43.666Z")).toBe("12:27 PM");
  });

  it("keeps calendar dates stored as UTC midnight on the day that was entered", () => {
    // A hire date typed as Oct 1 is stored 2026-10-01T00:00Z; it must never shift a day either way.
    expect(formatCalendarDate(new Date("2026-10-01T00:00:00.000Z"))).toBe("Oct 1, 2026");
    expect(formatCalendarDate("2026-10-01T00:00:00.000Z", { month: "short", day: "numeric" })).toBe("Oct 1");
    expect(formatCalendarDate(new Date("2026-12-31T00:00:00.000Z"), { year: "numeric", month: "numeric", day: "numeric" })).toBe("12/31/2026");
  });
});
