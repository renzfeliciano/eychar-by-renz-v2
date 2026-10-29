/**
 * The recruitment stages `npm run db:seed` gives an organization (seeded
 * configuration, ENGINEERING.md §54: HR can rename, reorder or deactivate them in
 * Settings › Catalogs). What a stage means is its metadata: `isTerminal`
 * (out of the pipeline) and `isHired` (counts as a hire).
 *
 * The three withdrawal outcomes (HR concerns deck, 27 Oct 2026) close an
 * application without counting it as a hire, while keeping the applicant's
 * record: an applicant who accepted the offer, or even started work, and
 * then backed out moves out of Hired into one of them.
 */
export const DEFAULT_RECRUITMENT_STAGES: { code: string; name: string; description?: string; sortOrder: number; metadata?: Record<string, unknown> }[] = [
  { code: "applied", name: "Applied", sortOrder: 0 },
  { code: "screening", name: "Screening", sortOrder: 1 },
  { code: "interview", name: "Interview", sortOrder: 2 },
  { code: "offer", name: "Offer", sortOrder: 3 },
  { code: "hired", name: "Hired", description: "Accepted the job offer and proceeded with employment.", sortOrder: 4, metadata: { isTerminal: true, isHired: true } },
  { code: "rejected", name: "Rejected", sortOrder: 5, metadata: { isTerminal: true } },
  {
    code: "withdrawn_before_start",
    name: "Withdrawn before start date",
    description: "Accepted the offer, then backed out before reporting for work.",
    sortOrder: 6,
    metadata: { isTerminal: true, isHired: false },
  },
  {
    code: "withdrawn_after_start",
    name: "Withdrawn after start date",
    description: "Started working, then backed out. Not counted as a hire.",
    sortOrder: 7,
    metadata: { isTerminal: true, isHired: false },
  },
  {
    code: "did_not_proceed",
    name: "Cancelled / did not proceed",
    description: "Hiring did not go ahead for another reason.",
    sortOrder: 8,
    metadata: { isTerminal: true, isHired: false },
  },
];
