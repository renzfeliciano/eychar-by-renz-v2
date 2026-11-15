/** Civil status as recorded on Philippine HR forms. Stored as the label itself, like gender. */
export const CIVIL_STATUSES = ["Single", "Married", "Widowed", "Legally separated", "Annulled"] as const;

export type CivilStatus = (typeof CIVIL_STATUSES)[number];
