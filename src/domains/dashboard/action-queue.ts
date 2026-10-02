/**
 * The dashboard's to-do list: concrete things to act on, each saying what to
 * do, for whom and by when, ranked so the most pressing comes first. The
 * page gathers the items (each only when the viewer may act on it); these
 * helpers decide urgency and order. Pure, so the rules are tested directly.
 */

export type ActionUrgency = "now" | "soon" | "later";

export type ActionItem = {
  id: string;
  /** Groups rows of the same kind ("leave", "payroll", "contract"…). */
  kind: string;
  /** What to do, e.g. "Approve PR-2026-0012". */
  title: string;
  /** For whom / what, e.g. "Ana Reyes · Vacation leave · Oct 6–8". */
  detail: string;
  href: string;
  actionLabel: string;
  urgency: ActionUrgency;
  /** The date it's due by ("YYYY-MM-DD"), when there is one. */
  dueKey?: string;
};

const URGENCY_ORDER: Record<ActionUrgency, number> = { now: 0, soon: 1, later: 2 };

/** Most urgent first; within the same urgency, the earliest due date, then by title. */
export function rankActions(items: ActionItem[]): ActionItem[] {
  return [...items].sort(
    (a, b) => URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency] || (a.dueKey ?? "9999-12-31").localeCompare(b.dueKey ?? "9999-12-31") || a.title.localeCompare(b.title),
  );
}

/** Whole days from `fromKey` to `toKey` (both "YYYY-MM-DD"); negative when `toKey` is past. */
export function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / 86_400_000);
}

/** "now" when due within `nowDays` (or overdue), "soon" within `soonDays`, otherwise "later". */
export function urgencyFor(todayKey: string, dueKey: string | undefined, nowDays: number, soonDays: number): ActionUrgency {
  if (!dueKey) return "later";
  const days = daysBetween(todayKey, dueKey);
  if (days <= nowDays) return "now";
  if (days <= soonDays) return "soon";
  return "later";
}

/** "today", "tomorrow", "in 5 days", "2 days ago". */
export function relativeDue(todayKey: string, dueKey: string): string {
  const days = daysBetween(todayKey, dueKey);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

/**
 * Too many rows of one kind (40 people missing IDs) bury everything else:
 * past `limit`, a kind collapses into one summary row that links to where
 * they're all handled.
 */
export function collapseKind(items: ActionItem[], limit: number, summary: (count: number) => ActionItem): ActionItem[] {
  return items.length > limit ? [summary(items.length)] : items;
}
