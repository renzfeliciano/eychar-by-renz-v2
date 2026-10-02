import { codesWithFlag } from "@/domains/catalog/catalog-flags";

/**
 * How a case list reads at a glance: open vs closed, where the open ones
 * sit (classification, project) and which have gone quiet. Shared by the
 * Case monitoring screen and the dashboard's "Open cases" count.
 *
 * Whether a status ends a case is data: the case status catalog item's
 * `metadata.isClosed` (see `closedCaseCodes`).
 */

/**
 * The codes that ended a case before `isClosed` existed. Only a fallback:
 * used for a status item that doesn't carry the flag yet (or a status with
 * no catalog item), so existing data reads as before. Not a business rule
 * to extend: flag the catalog item instead.
 */
export const LEGACY_CLOSED_CASE_CODES: ReadonlySet<string> = new Set(["dismissed", "closed", "resolved", "settled"]);

/** The case status codes that end a case, from the organization's case status catalog. */
export function closedCaseCodes(statuses: { code: string; metadata?: unknown }[]): ReadonlySet<string> {
  return codesWithFlag(statuses, "isClosed", LEGACY_CLOSED_CASE_CODES);
}

/** An open case with no update for this many days is flagged for follow-up. */
export const CASE_STALE_DAYS = 90;

const DAY_MS = 86_400_000;

/** `closedCodes` from `closedCaseCodes(statuses)`; without it, only the legacy codes count as closed. */
export function isOpenCase(status: string, closedCodes: ReadonlySet<string> = LEGACY_CLOSED_CASE_CODES): boolean {
  return !closedCodes.has(status);
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

export function isStaleCase(item: CaseLike, now: Date, closedCodes: ReadonlySet<string> = LEGACY_CLOSED_CASE_CODES): boolean {
  if (!isOpenCase(item.status, closedCodes) || !item.updatedAt) return false;
  return now.getTime() - new Date(item.updatedAt).getTime() > CASE_STALE_DAYS * DAY_MS;
}

export function summarizeCases(cases: CaseLike[], now: Date, closedCodes: ReadonlySet<string> = LEGACY_CLOSED_CASE_CODES): CaseSummary {
  const open = cases.filter((item) => isOpenCase(item.status, closedCodes));
  return {
    open: open.length,
    closed: cases.length - open.length,
    stale: open.filter((item) => isStaleCase(item, now, closedCodes)).length,
    byClassification: countBy(open, (item) => item.classification),
    byProject: countBy(open, (item) => item.projectId.toString()),
  };
}

/** `view` is "all", "open", "closed", or one status code. */
export function filterCasesByView<T extends { status: string }>(cases: T[], view: string, closedCodes: ReadonlySet<string> = LEGACY_CLOSED_CASE_CODES): T[] {
  if (view === "all") return cases;
  if (view === "open") return cases.filter((item) => isOpenCase(item.status, closedCodes));
  if (view === "closed") return cases.filter((item) => !isOpenCase(item.status, closedCodes));
  return cases.filter((item) => item.status === view);
}
