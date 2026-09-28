export type ClockFlowStep = "idle" | "locating" | "liveness" | "biometric" | "submitting";
export type ClockCheckState = "waiting" | "active" | "done";

const ORDER = ["locating", "liveness", "biometric", "submitting"] as const;

/** Where each of the three clock checks stands for the current step of the flow. */
export function clockCheckStates(step: ClockFlowStep): Record<"location" | "face" | "biometric", ClockCheckState> {
  const reached = step === "idle" ? -1 : ORDER.indexOf(step);
  const stateAt = (index: number): ClockCheckState => (reached > index ? "done" : reached === index ? "active" : "waiting");
  return { location: stateAt(0), face: stateAt(1), biometric: stateAt(2) };
}

/** "2h 15m" / "42m" between two ISO instants, floored to the minute and never negative. */
export function formatWorkedDuration(fromIso: string, toIso: string): string {
  const minutes = Math.max(0, Math.floor((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}
