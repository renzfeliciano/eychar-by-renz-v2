export type ShiftHoursShape = {
  kind: "work" | "rest";
  pattern?: "fixed" | "flexible" | null;
  startTime?: string | null;
  endTime?: string | null;
  latestStartTime?: string | null;
  requiredHours?: number | null;
};

/**
 * One wording for a shift's hours everywhere (grid, dialogs, clock page,
 * exports): "08:00–17:00", "22:00–07:00 (+1 day)" for an overnight end,
 * "Flexi: start 07:00–10:00, 8h" for a start window, "Day off" for rest.
 * Exports pass a plain hyphen so spreadsheets don't get an en dash.
 */
export function describeShiftHours(shift: ShiftHoursShape, options: { dash?: string; restLabel?: string } = {}): string {
  const dash = options.dash ?? "–";
  if (shift.kind === "rest") return options.restLabel ?? "Day off";
  if (shift.pattern === "flexible") {
    if (!shift.startTime || !shift.latestStartTime) return "";
    return `Flexi: start ${shift.startTime}${dash}${shift.latestStartTime}${shift.requiredHours ? `, ${shift.requiredHours}h` : ""}`;
  }
  if (!shift.startTime || !shift.endTime) return "";
  return `${shift.startTime}${dash}${shift.endTime}${shift.endTime < shift.startTime ? " (+1 day)" : ""}`;
}
