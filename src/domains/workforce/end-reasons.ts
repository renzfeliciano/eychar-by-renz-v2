import { catalogFlag } from "@/domains/catalog/catalog-flags";

export type EndReason = { code: string; name: string; requiresNote: boolean };

type StatusItem = { code: string; name: string; metadata?: unknown };

/** Codes the platform seeded as needing a note, so older items without the flag keep behaving the same. */
const LEGACY_NOTE_CODES: ReadonlySet<string> = new Set(["terminated", "awol"]);

/**
 * Employment statuses that end employment, for the "End employment" dialog.
 * Mirrors `EmploymentService.isActiveStatus`: an item flagged
 * `isActiveHeadcount: false` ends employment, `true` does not, and an unflagged
 * item counts as active (only the literal "terminated" is the exception). What
 * a status means is catalog data, so HR can add reasons in Settings without code.
 * `requiresNote` is a catalog flag too. Pure, so it is safe to import anywhere.
 */
export function endReasonChoices(statuses: StatusItem[]): EndReason[] {
  if (statuses.length === 0) return [{ code: "terminated", name: "Terminated", requiresNote: true }];

  return statuses
    .filter((status) => {
      const metadata = status.metadata;
      const flag = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>).isActiveHeadcount : undefined;
      return typeof flag === "boolean" ? !flag : status.code === "terminated";
    })
    .map((status) => ({ code: status.code, name: status.name, requiresNote: catalogFlag(status, "requiresNote", LEGACY_NOTE_CODES) }));
}
