import { daysBetween, relativeDue, urgencyFor, type ActionItem } from "./action-queue";

/**
 * Legal and compliance risks the dashboard watches: dates the law (or the
 * organization's own policy) attaches consequences to. Every deadline comes
 * from configuration: an employment type's `regularizeAfterMonths`, the
 * organization's `compliance.finalPayDays`, a document's `expiresAt`.
 * Pure functions over already-loaded data, so the rules are tested directly.
 */

/** How far ahead a deadline starts showing. */
export const RISK_WINDOW_DAYS = 30;

function addMonths(key: string, months: number): string {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, day));
  // Mar 31 + 1 month is Apr 30, not May 1.
  if (date.getUTCDate() !== day) date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
}

function addDays(key: string, days: number): string {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * What already settles a probation's evaluation (ADR-053): HR recorded it as
 * sent or completed outside PCAS HRIS (`followUps`, keyed by
 * `regularizationFollowUpKey`), or an evaluation of a regularization type
 * was submitted in Performance since the employee was hired
 * (`evaluatedOn`: employee id → latest submission, "YYYY-MM-DD").
 */
export type ProbationEvaluations = { followUps: ReadonlySet<string>; evaluatedOn: ReadonlyMap<string, string> };

export const regularizationFollowUpKey = (employeeId: string, regularKey: string) => `${employeeId}|${regularKey}`;

/**
 * Probationary staff nearing (or past) the date they become regular by law
 * unless evaluated. `regularizeAfterMonths` per employment type code; types
 * without it are not watched. Probations whose evaluation is already sent,
 * done or submitted (`handled`) are left out.
 */
export function regularizationRisks(
  staff: { id: string; name: string; employmentType?: string | null; hiredKey?: string | null }[],
  regularizeAfterMonths: ReadonlyMap<string, number>,
  todayKey: string,
  handled: ProbationEvaluations = { followUps: new Set(), evaluatedOn: new Map() },
): ActionItem[] {
  return staff.flatMap((employee) => {
    const months = employee.employmentType ? regularizeAfterMonths.get(employee.employmentType) : undefined;
    if (!months || !employee.hiredKey) return [];
    const regularKey = addMonths(employee.hiredKey, months);
    const days = daysBetween(todayKey, regularKey);
    if (days > RISK_WINDOW_DAYS) return [];
    if (handled.followUps.has(regularizationFollowUpKey(employee.id, regularKey))) return [];
    const evaluatedOn = handled.evaluatedOn.get(employee.id);
    if (evaluatedOn && evaluatedOn >= employee.hiredKey) return [];
    return [
      {
        id: `regularize-${employee.id}`,
        kind: "regularization",
        title: days < 0 ? `${employee.name} may already be regular` : `Evaluate ${employee.name} before regularization`,
        detail: days < 0 ? `Probation ended ${relativeDue(todayKey, regularKey)} (${months} months); update the employment type or record the decision` : `Becomes regular ${relativeDue(todayKey, regularKey)} unless evaluated (${months}-month probation)`,
        href: `/people/${employee.id}`,
        actionLabel: "Open profile",
        urgency: urgencyFor(todayKey, regularKey, 7, RISK_WINDOW_DAYS),
        dueKey: regularKey,
        subjectId: employee.id,
      },
    ];
  });
}

/**
 * Separated employees whose final pay isn't out yet, against the
 * organization's deadline (days after the last working day).
 */
export function finalPayRisks(
  separations: { clearanceId: string; employeeName: string; lastWorkingDayKey: string; settlementId?: string; settlementStatus?: string | null }[],
  finalPayDays: number,
  todayKey: string,
): ActionItem[] {
  return separations.flatMap((separation) => {
    if (separation.settlementStatus === "disbursed" || separation.settlementStatus === "cancelled") return [];
    const deadlineKey = addDays(separation.lastWorkingDayKey, finalPayDays);
    const days = daysBetween(todayKey, deadlineKey);
    if (days > RISK_WINDOW_DAYS) return [];
    return [
      {
        id: `final-pay-${separation.clearanceId}`,
        kind: "final-pay",
        title: days < 0 ? `Final pay overdue: ${separation.employeeName}` : `Release ${separation.employeeName}'s final pay`,
        detail: `Due ${relativeDue(todayKey, deadlineKey)} (${finalPayDays} days after the last working day)${separation.settlementStatus ? ` · settlement ${separation.settlementStatus}` : " · no settlement yet"}`,
        href: separation.settlementId ? `/final-settlements/${separation.settlementId}` : `/clearance/${separation.clearanceId}`,
        actionLabel: separation.settlementId ? "Open settlement" : "Open clearance",
        urgency: urgencyFor(todayKey, deadlineKey, 7, 14),
        dueKey: deadlineKey,
      },
    ];
  });
}

/** Employee documents (contracts, licenses, permits) expired or expiring within the window. */
export function documentRisks(documents: { id: string; employeeId: string; employeeName: string; title: string; expiresKey: string }[], todayKey: string): ActionItem[] {
  return documents.flatMap((document) => {
    const days = daysBetween(todayKey, document.expiresKey);
    if (days > RISK_WINDOW_DAYS) return [];
    return [
      {
        id: `document-${document.id}`,
        kind: "document",
        title: days < 0 ? `${document.title} expired: ${document.employeeName}` : `Renew ${document.employeeName}'s ${document.title}`,
        detail: days < 0 ? `Expired ${relativeDue(todayKey, document.expiresKey)}` : `Expires ${relativeDue(todayKey, document.expiresKey)}`,
        href: `/people/${document.employeeId}?tab=documents`,
        actionLabel: "Open documents",
        urgency: urgencyFor(todayKey, document.expiresKey, 7, RISK_WINDOW_DAYS),
        dueKey: document.expiresKey,
      },
    ];
  });
}
