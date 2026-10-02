import { catalogFlag } from "@/domains/catalog/catalog-flags";

/**
 * Pure helpers for the applicant-tracking board: search and filter, how
 * long ago someone applied, and how a stage reads (open, hired, closed).
 * What a stage means is data on its catalog item: `metadata.isTerminal`
 * (out of the pipeline) and `metadata.isHired` (the hire outcome).
 */

type Searchable = { applicantName: string; email?: string | null; positionId: string; positionTitle: string };

export function filterApplicants<T extends Searchable>(applicants: T[], { query, positionId }: { query?: string; positionId?: string }): T[] {
  const needle = query?.trim().toLowerCase() ?? "";
  return applicants.filter((applicant) => {
    if (positionId && applicant.positionId !== positionId) return false;
    if (!needle) return true;
    return [applicant.applicantName, applicant.email ?? "", applicant.positionTitle].some((value) => value.toLowerCase().includes(needle));
  });
}

const DAY_MS = 86_400_000;

/** Whole calendar days (UTC) from `dateIso` to `now`; a future date counts as today. */
export function daysSince(dateIso: string, now: Date): number {
  const start = Date.parse(dateIso.slice(0, 10));
  const today = Date.parse(now.toISOString().slice(0, 10));
  return Math.max(0, Math.round((today - start) / DAY_MS));
}

export function describeApplied(days: number): string {
  if (days === 0) return "Applied today";
  if (days === 1) return "Applied yesterday";
  if (days < 14) return `Applied ${days} days ago`;
  if (days < 60) return `Applied ${Math.floor(days / 7)} weeks ago`;
  return `Applied ${Math.floor(days / 30)} months ago`;
}

/**
 * The stage code that meant "hired" before `isHired` existed: only a
 * fallback for a stage item that doesn't carry the flag yet, so existing
 * data reads as before. Flag the catalog item rather than extending this.
 */
export const LEGACY_HIRED_STAGE_CODES: ReadonlySet<string> = new Set(["hired"]);

/** Whether a recruitment stage catalog item is a hire (its `metadata.isHired`, else the legacy code). */
export function isHiredStage(stage: { code: string; metadata?: unknown }): boolean {
  return catalogFlag(stage, "isHired", LEGACY_HIRED_STAGE_CODES);
}

export type StageTone = "open" | "success" | "closed";

/**
 * A hire is the good outcome; any other closing stage (rejected, withdrawn)
 * is simply closed. `isHired` comes from the catalog (`isHiredStage`); a
 * stage passed without it falls back to the legacy code.
 */
export function stageTone(stage: { code: string; isTerminal?: boolean; isHired?: boolean }): StageTone {
  if (stage.isHired ?? LEGACY_HIRED_STAGE_CODES.has(stage.code)) return "success";
  return stage.isTerminal ? "closed" : "open";
}
