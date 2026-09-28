import { describe, it, expect } from "vitest";
import { travelTiming, timelineBars } from "@/domains/travel-orders/travel-timing";

const order = (id: string, start: string, end: string, status = "scheduled") => ({
  id,
  startDate: new Date(`${start}T00:00:00.000Z`),
  endDate: new Date(`${end}T00:00:00.000Z`),
  status,
});

describe("travelTiming", () => {
  const today = "2026-09-28";
  it("reads where an order stands today from its dates", () => {
    expect(travelTiming(order("a", "2026-09-28", "2026-09-28"), today)).toBe("ongoing");
    expect(travelTiming(order("b", "2026-09-25", "2026-09-30"), today)).toBe("ongoing");
    expect(travelTiming(order("c", "2026-09-29", "2026-10-02"), today)).toBe("scheduled");
    expect(travelTiming(order("d", "2026-09-20", "2026-09-27"), today)).toBe("completed");
    expect(travelTiming(order("e", "2026-09-25", "2026-09-30", "cancelled"), today)).toBe("cancelled");
  });
});

describe("timelineBars", () => {
  it("places live orders that overlap the window as column spans, clipped to its edges, soonest first", () => {
    const bars = timelineBars(
      [
        order("late", "2026-10-08", "2026-10-20"),
        order("now", "2026-09-25", "2026-09-29"),
        order("gone", "2026-09-01", "2026-09-10"),
        order("off", "2026-09-29", "2026-09-30", "cancelled"),
        order("mid", "2026-10-01", "2026-10-02"),
      ],
      "2026-09-28",
      14,
    );
    expect(bars.map((bar) => bar.id)).toEqual(["now", "mid", "late"]);
    expect(bars[0]).toMatchObject({ start: 0, span: 2, continuesBefore: true, continuesAfter: false });
    expect(bars[1]).toMatchObject({ start: 3, span: 2, continuesBefore: false, continuesAfter: false });
    // Window is Sep 28 – Oct 11: Oct 8 is column 10, clipped after Oct 11.
    expect(bars[2]).toMatchObject({ start: 10, span: 4, continuesBefore: false, continuesAfter: true });
  });
});
