/**
 * The civil statuses a new organization starts with, as on Philippine HR
 * forms. Starting data only: each organization can add, rename or retire
 * them under Settings › Catalogs, so nothing in the code depends on these
 * codes. A person's record stores the code, not the name.
 */
export const CIVIL_STATUS_DEFAULTS: { code: string; name: string; sortOrder: number }[] = [
  { code: "single", name: "Single", sortOrder: 0 },
  { code: "married", name: "Married", sortOrder: 1 },
  { code: "widowed", name: "Widowed", sortOrder: 2 },
  { code: "legally_separated", name: "Legally separated", sortOrder: 3 },
  { code: "annulled", name: "Annulled", sortOrder: 4 },
];
