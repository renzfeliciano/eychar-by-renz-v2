import type { DayType } from "./day-calc";

/** How a stored day type reads on screens and in exports (attendance plan Phase 6). */
export const DAY_TYPE_LABELS: Record<DayType, string> = {
  workday: "Workday",
  rest_day: "Rest day",
  regular_holiday: "Regular holiday",
  special_holiday: "Special non-working day",
  special_working: "Special working day",
};

export function dayTypeLabel(dayType: string | null | undefined): string {
  return dayType ? (DAY_TYPE_LABELS[dayType as DayType] ?? dayType) : "";
}

/** 150 → "2h 30m", 45 → "45m", 120 → "2h". */
export function formatMinutesShort(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}
