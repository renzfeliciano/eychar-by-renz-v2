/** The employee profile's "at a glance" figures and record checks. */

const DAY_MS = 86_400_000;
const EXPIRING_WITHIN_DAYS = 30;

export type DocumentExpiry = "expired" | "expiring" | "valid" | "none";

export function documentExpiry(expiresAt: Date | string | null | undefined, now: Date): DocumentExpiry {
  if (!expiresAt) return "none";
  const time = new Date(expiresAt).getTime();
  if (time < now.getTime()) return "expired";
  return time - now.getTime() <= EXPIRING_WITHIN_DAYS * DAY_MS ? "expiring" : "valid";
}

type GovernmentIds = { sssNumber?: string | null; philHealthNumber?: string | null; pagIbigNumber?: string | null; tinNumber?: string | null };

/** Which Philippine government numbers aren't on file (the ones payroll remittance needs). */
export function missingGovernmentIds(person: GovernmentIds | null | undefined): string[] {
  const checks: [keyof GovernmentIds, string][] = [
    ["sssNumber", "SSS"],
    ["philHealthNumber", "PhilHealth"],
    ["pagIbigNumber", "Pag-IBIG"],
    ["tinNumber", "TIN"],
  ];
  return checks.filter(([key]) => !person?.[key]?.trim()).map(([, label]) => label);
}

export function profileAtAGlance(
  input: {
    year: number;
    leave: { year: number; available: number | null; unlimited: boolean }[];
    assets: { returnedDate?: Date | string | null }[];
    documents: { expiresAt?: Date | string | null }[];
  },
  now: Date,
) {
  const thisYear = input.leave.filter((balance) => balance.year === input.year);
  return {
    leaveDaysLeft: thisYear.reduce((sum, balance) => sum + (balance.unlimited ? 0 : (balance.available ?? 0)), 0),
    hasUnlimitedLeave: thisYear.some((balance) => balance.unlimited),
    assetsOut: input.assets.filter((asset) => !asset.returnedDate).length,
    documents: input.documents.length,
    documentsNeedingAttention: input.documents.filter((document) => ["expired", "expiring"].includes(documentExpiry(document.expiresAt, now))).length,
  };
}
