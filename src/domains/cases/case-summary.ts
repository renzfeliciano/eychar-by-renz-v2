/**
 * How a case list reads at a glance: open vs closed, where the open ones
 * sit (classification, project) and which have gone quiet. Shared by the
 * Case monitoring screen and the dashboard's "Open cases" count.
 */

/** Status codes that end a case. Everything else is still open. */
export const CLOSED_CASE_CODES: ReadonlySet<string> = new Set(["dismissed", "closed", "resolved", "settled"]);

/** An open case with no update for this many days is flagged for follow-up. */
export const CASE_STALE_DAYS = 90;

const DAY_MS = 86_400_000;

export function isOpenCase(status: string): boolean {
  return !CLOSED_CASE_CODES.has(status);
}

type CaseLike = { status: string; classification: string; projectId: { toString(): string }; updatedAt?: Date | string | null };

export type CaseSummary = {
  open: number;
  closed: number;
  stale: number;
  byClassification: { key: string; count: number }[];
  byProject: { key: string; count: number }[];
};

function countBy<T>(items: T[], key: (item: T) => string): { key: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return [...counts.entries()].map(([k, count]) => ({ key: k, count })).sort((a, b) => b.count - a.count);
}

export function isStaleCase(item: CaseLike, now: Date): boolean {
  if (!isOpenCase(item.status) || !item.updatedAt) return false;
  return now.getTime() - new Date(item.updatedAt).getTime() > CASE_STALE_DAYS * DAY_MS;
}

export function summarizeCases(cases: CaseLike[], now: Date): CaseSummary {
  const open = cases.filter((item) => isOpenCase(item.status));
  return {
    open: open.length,
    closed: cases.length - open.length,
    stale: open.filter((item) => isStaleCase(item, now)).length,
    byClassification: countBy(open, (item) => item.classification),
    byProject: countBy(open, (item) => item.projectId.toString()),
  };
}

/** `view` is "all", "open", "closed", or one status code. */
export function filterCasesByView<T extends { status: string }>(cases: T[], view: string): T[] {
  if (view === "all") return cases;
  if (view === "open") return cases.filter((item) => isOpenCase(item.status));
  if (view === "closed") return cases.filter((item) => !isOpenCase(item.status));
  return cases.filter((item) => item.status === view);
}
