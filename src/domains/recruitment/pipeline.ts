/**
 * Pure helpers for the applicant-tracking board: search and filter, how
 * long ago someone applied, and how a stage reads (open, hired, closed).
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

export type StageTone = "open" | "success" | "closed";

/** Hired is the good outcome; any other closing stage (rejected, withdrawn) is simply closed. */
export function stageTone(stage: { code: string; isTerminal?: boolean }): StageTone {
  if (stage.code === "hired") return "success";
  return stage.isTerminal ? "closed" : "open";
}
