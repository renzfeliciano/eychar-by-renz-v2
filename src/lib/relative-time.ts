const DAY_MS = 86_400_000;

/**
 * "Today", "Yesterday", "3 days ago", "3 weeks ago", "3 months ago",
 * "2 years ago": how long since a date, counted in UTC calendar days so the
 * server and browser render the same words.
 */
export function formatRelativeDays(date: Date | string, now: Date): string {
  const then = Date.parse(new Date(date).toISOString().slice(0, 10));
  const today = Date.parse(now.toISOString().slice(0, 10));
  const days = Math.max(0, Math.round((today - then) / DAY_MS));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 730) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}
