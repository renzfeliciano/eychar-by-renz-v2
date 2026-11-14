/**
 * The complaint stages `npm run db:seed` gives an organization (seeded
 * configuration, ENGINEERING.md §54: HR can rename, reorder or deactivate them in
 * Settings › Catalogs). They are the columns of the complaints board. What a
 * stage means is its metadata: `isTerminal` marks the stage where a complaint
 * is closed.
 */
export const DEFAULT_COMPLAINT_STAGES: { code: string; name: string; description?: string; sortOrder: number; metadata?: Record<string, unknown> }[] = [
  { code: "received", name: "Received IR/complaint", sortOrder: 0 },
  { code: "nte_scheduled", name: "Set a date for NTE", description: "A notice to explain (NTE) date has been set for the respondent.", sortOrder: 1 },
  { code: "administrative_hearing", name: "Administrative Hearing", sortOrder: 2 },
  { code: "sanction", name: "Sanction", description: "The decision and any sanction. The complaint is closed.", sortOrder: 3, metadata: { isTerminal: true } },
];
