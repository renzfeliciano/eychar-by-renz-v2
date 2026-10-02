/** The employee profile's record checks and its "needs attention" list. */

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

export type AttentionTone = "danger" | "warning" | "info";
export type AttentionItem = { key: string; tone: AttentionTone; text: string; tab: string };

/**
 * What needs doing about this one person, most urgent first: the profile's
 * Overview. Only what the viewer can act on or see is passed in (a section
 * they can't read arrives as undefined and is skipped).
 */
export function profileAttention(
  input: {
    active: boolean;
    contractEnd?: Date | string | null;
    hasPosition: boolean;
    missingIds: string[];
    documents?: { documentType?: string | null; title?: string | null; expiresAt?: Date | string | null }[];
    pendingLeave?: number;
    openClearance?: { lastWorkingDay: Date | string } | null;
    hasPayTerms?: boolean;
    hasSelfServiceLogin: boolean;
  },
  now: Date,
): AttentionItem[] {
  const items: AttentionItem[] = [];
  const daysUntil = (value: Date | string) => Math.ceil((new Date(value).getTime() - now.getTime()) / DAY_MS);
  const inDays = (days: number) => (days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`);

  if (input.openClearance) {
    const days = daysUntil(input.openClearance.lastWorkingDay);
    items.push({ key: "clearance", tone: "danger", text: days >= 0 ? `Leaving: last working day ${inDays(days)}. Clearance is open.` : `Clearance still open ${-days} day${days === -1 ? "" : "s"} after their last working day.`, tab: "offboarding" });
  }
  if (input.active && input.contractEnd) {
    const days = daysUntil(input.contractEnd);
    if (days < 0) items.push({ key: "contract", tone: "danger", text: `Contract ended ${-days} day${days === -1 ? "" : "s"} ago, but they're still active.`, tab: "job" });
    else if (days <= EXPIRING_WITHIN_DAYS) items.push({ key: "contract", tone: "warning", text: `Contract ends ${inDays(days)}: renew, regularize or start clearance.`, tab: "job" });
  }
  for (const document of input.documents ?? []) {
    const state = documentExpiry(document.expiresAt, now);
    const name = document.title || document.documentType || "A document";
    if (state === "expired") items.push({ key: `doc-${name}`, tone: "danger", text: `${name} has expired.`, tab: "documents" });
    else if (state === "expiring") items.push({ key: `doc-${name}`, tone: "warning", text: `${name} expires ${inDays(daysUntil(document.expiresAt!))}.`, tab: "documents" });
  }
  if (input.missingIds.length) items.push({ key: "ids", tone: "warning", text: `Missing ${input.missingIds.join(", ")}: payroll can't remit contributions until these are on file.`, tab: "overview" });
  if (input.pendingLeave) items.push({ key: "leave", tone: "info", text: `${input.pendingLeave} leave request${input.pendingLeave === 1 ? "" : "s"} waiting for a decision.`, tab: "leave" });
  if (input.active && input.hasPayTerms === false) items.push({ key: "pay", tone: "warning", text: "No pay terms on file, so payroll will skip them.", tab: "pay" });
  if (input.active && !input.hasPosition) items.push({ key: "position", tone: "info", text: "No position or project assigned.", tab: "job" });
  if (input.active && !input.hasSelfServiceLogin) items.push({ key: "login", tone: "info", text: "No self-service login, so they can't clock in on their own phone.", tab: "overview" });

  const rank: Record<AttentionTone, number> = { danger: 0, warning: 1, info: 2 };
  return items.sort((a, b) => rank[a.tone] - rank[b.tone]);
}
