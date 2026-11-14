/** Pure helpers for the complaints board (no database), tested directly. */

/**
 * Narrows complaints by what was typed. Every word must appear somewhere in the IR
 * number or the respondent's name, in any order, ignoring case ("cruz juan" finds
 * "Juan Dela Cruz"). A blank query keeps everything.
 */
export function filterComplaints<T extends { irNumber: string; respondentName: string }>(complaints: T[], filters: { query?: string }): T[] {
  const words = (filters.query ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return complaints;
  return complaints.filter((complaint) => {
    const haystack = `${complaint.irNumber} ${complaint.respondentName}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

/** A complaint is closed when its stage is flagged `isTerminal` in the catalog, never by a stage code. */
export function isClosedStage(stage: { metadata?: Record<string, unknown> }): boolean {
  return stage.metadata?.isTerminal === true;
}

/**
 * A stage a complaint still sits in but the catalog no longer lists (renamed or
 * deactivated) still gets its own column, so that complaint is never silently hidden.
 */
export function withOrphanedStages<S extends { code: string }>(stages: S[], complaints: { stage: string }[]): (S | { code: string; name: string })[] {
  const known = new Set(stages.map((stage) => stage.code));
  const orphaned = [...new Set(complaints.map((complaint) => complaint.stage).filter((code) => !known.has(code)))].map((code) => ({ code, name: code }));
  return [...stages, ...orphaned];
}
