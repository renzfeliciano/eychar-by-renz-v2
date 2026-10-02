/**
 * Pure helpers behind the dashboard: the greeting and the events coming up.
 * What needs doing and the legal risks are in action-queue.ts and
 * compliance-risks.ts.
 */

// Two-hour slots in the app's time zone (hourInAppZone), worded the way the
// product owner wrote them: natural, a little playful.
const GREETINGS: { until: number; line: (name: string) => string }[] = [
  { until: 2, line: (n) => `Still up${n}?` },
  { until: 4, line: (n) => `Burning the midnight oil${n}?` },
  { until: 6, line: (n) => `You're up early${n}.` },
  { until: 8, line: (n) => `Rise and shine${n}.` },
  { until: 10, line: (n) => `Good morning${n}.` },
  { until: 12, line: (n) => `Morning's treating you well${n}?` },
  { until: 14, line: (n) => `Lunchtime${n}?` },
  { until: 16, line: (n) => `Good afternoon${n}.` },
  { until: 18, line: (n) => `Afternoon's flying by${n}.` },
  { until: 20, line: (n) => `Good evening${n}.` },
  { until: 22, line: (n) => `Winding down${n}?` },
  { until: 24, line: (n) => `Working late${n}?` },
];

/** A greeting that fits the hour: "Still up, Travis?" at 1 AM, "Lunchtime, Travis?" at noon. */
export function greetingFor(hour: number, firstName = ""): string {
  const slot = GREETINGS.find((candidate) => hour < candidate.until) ?? GREETINGS[GREETINGS.length - 1];
  return slot.line(firstName ? `, ${firstName}` : "");
}

/** Active events on or after `todayKey` (YYYY-MM-DD), soonest first. */
export function upcomingEvents<T extends { date: Date; status?: string | null }>(events: T[], todayKey: string, limit: number): T[] {
  return events
    .filter((event) => event.status !== "cancelled" && new Date(event.date).toISOString().slice(0, 10) >= todayKey)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, limit);
}
