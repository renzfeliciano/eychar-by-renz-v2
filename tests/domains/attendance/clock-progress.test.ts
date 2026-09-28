import { describe, it, expect } from "vitest";
import { clockCheckStates, formatWorkedDuration } from "@/domains/attendance/clock-progress";

describe("clockCheckStates", () => {
  it("shows every check waiting before the employee starts", () => {
    expect(clockCheckStates("idle")).toEqual({ location: "waiting", face: "waiting", biometric: "waiting" });
  });

  it("marks earlier checks done and the current one active as the flow advances", () => {
    expect(clockCheckStates("locating")).toEqual({ location: "active", face: "waiting", biometric: "waiting" });
    expect(clockCheckStates("liveness")).toEqual({ location: "done", face: "active", biometric: "waiting" });
    expect(clockCheckStates("biometric")).toEqual({ location: "done", face: "done", biometric: "active" });
    expect(clockCheckStates("submitting")).toEqual({ location: "done", face: "done", biometric: "done" });
  });
});

describe("formatWorkedDuration", () => {
  it("formats hours and minutes between two instants", () => {
    expect(formatWorkedDuration("2026-09-29T01:05:00.000Z", "2026-09-29T03:20:00.000Z")).toBe("2h 15m");
  });

  it("drops the hours under an hour and never goes negative", () => {
    expect(formatWorkedDuration("2026-09-29T01:05:00.000Z", "2026-09-29T01:47:30.000Z")).toBe("42m");
    expect(formatWorkedDuration("2026-09-29T01:05:00.000Z", "2026-09-29T01:00:00.000Z")).toBe("0m");
  });
});
