import { describe, it, expect } from "vitest";
import { greetingFor, upcomingEvents } from "@/domains/dashboard/dashboard-summary";

describe("greetingFor", () => {
  it("fits every two-hour slot of the day", () => {
    const expected: [number, string][] = [
      [0, "Still up, Travis?"],
      [3, "Burning the midnight oil, Travis?"],
      [5, "You're up early, Travis."],
      [7, "Rise and shine, Travis."],
      [9, "Good morning, Travis."],
      [11, "Morning's treating you well, Travis?"],
      [12, "Lunchtime, Travis?"],
      [15, "Good afternoon, Travis."],
      [17, "Afternoon's flying by, Travis."],
      [19, "Good evening, Travis."],
      [21, "Winding down, Travis?"],
      [23, "Working late, Travis?"],
    ];
    for (const [hour, line] of expected) expect(greetingFor(hour, "Travis")).toBe(line);
  });

  it("reads naturally without a name", () => {
    expect(greetingFor(9)).toBe("Good morning.");
    expect(greetingFor(1)).toBe("Still up?");
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
