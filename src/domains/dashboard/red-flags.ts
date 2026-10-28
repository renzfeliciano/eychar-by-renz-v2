/**
 * Red flags (HR concerns deck, 27 Oct 2026): issues flagged in a clearance
 * (a cash collection discrepancy, unreturned equipment) that are still
 * unresolved, so HR and management see them before final pay is released.
 * Each says what the issue is, how much is involved, which department
 * flagged it and who, and where its resolution stands. Pure, over data the
 * dashboard already loads, so the rules are tested directly.
 */

export type RedFlagStage = "no-settlement" | "not-in-settlement" | "in-settlement" | "approved" | "hidden";

export type RedFlag = {
  id: string;
  clearanceId: string;
  employeeName: string;
  /** The checklist item, e.g. "Turn over cash collections". */
  item: string;
  /** What's wrong, as the department wrote it when flagging. */
  issue: string | null;
  amount: number | null;
  department: string;
  flaggedBy: string | null;
  flaggedOn: Date | null;
  stage: RedFlagStage;
  /** Where its resolution stands, in words. */
  resolution: string;
  href: string;
};

type CaseItem = { _id: { toString(): string }; title: string; departmentName: string; status: string; amount?: number | null; note?: string | null; actedBy?: { toString(): string } | null; actedAt?: Date | null };
type Case = { _id: { toString(): string }; employeeName: string; status: string; items: CaseItem[] };
type Settlement = { status: string; lines?: { clearanceItemId?: string | null; direction: string }[] };

const SETTLEMENT_STAGE: Record<string, string> = {
  draft: "draft",
  submitted: "awaiting review",
  reviewed: "awaiting approval",
};

/**
 * Every flagged item of a case still in progress, until it's settled:
 * reopened and cleared or waived in the clearance (no longer flagged), or
 * paid through a disbursed final settlement. `settlementByCase` is null when
 * the viewer can't see final settlements; the resolution then says only
 * that it's open in the clearance.
 */
export function clearanceRedFlags(cases: Case[], settlementByCase: ReadonlyMap<string, Settlement> | null, nameOfUser: (userId: string) => string | undefined): RedFlag[] {
  const flags: RedFlag[] = [];
  for (const clearance of cases) {
    if (clearance.status === "cancelled" || clearance.status === "closed") continue;
    const settlement = settlementByCase?.get(clearance._id.toString());
    if (settlement?.status === "disbursed") continue;
    for (const item of clearance.items) {
      if (item.status !== "flagged") continue;
      const itemId = item._id.toString();
      const amount = item.amount && item.amount > 0 ? item.amount : null;
      const deducted = Boolean(settlement?.lines?.some((line) => line.clearanceItemId === itemId && line.direction === "deduction"));
      const { stage, resolution } = resolutionOf(settlementByCase === null, settlement, amount, deducted);
      flags.push({
        id: `${clearance._id.toString()}-${itemId}`,
        clearanceId: clearance._id.toString(),
        employeeName: clearance.employeeName,
        item: item.title,
        issue: item.note?.trim() || null,
        amount,
        department: item.departmentName,
        flaggedBy: item.actedBy ? (nameOfUser(item.actedBy.toString()) ?? null) : null,
        flaggedOn: item.actedAt ? new Date(item.actedAt) : null,
        stage,
        resolution,
        href: `/clearance/${clearance._id.toString()}`,
      });
    }
  }
  // Largest amounts first, then the oldest flag.
  return flags.sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0) || (a.flaggedOn?.getTime() ?? 0) - (b.flaggedOn?.getTime() ?? 0) || a.employeeName.localeCompare(b.employeeName));
}

function resolutionOf(hidden: boolean, settlement: Settlement | undefined, amount: number | null, deducted: boolean): { stage: RedFlagStage; resolution: string } {
  if (hidden) return { stage: "hidden", resolution: "Unresolved in clearance" };
  if (!settlement || settlement.status === "cancelled") return { stage: "no-settlement", resolution: amount ? "Unresolved · no final settlement yet" : "Unresolved · no amount recorded" };
  if (settlement.status === "approved") return { stage: "approved", resolution: deducted ? "Deduction approved · final pay not yet released" : "Not in the approved settlement" };
  const where = SETTLEMENT_STAGE[settlement.status] ?? settlement.status;
  if (deducted) return { stage: "in-settlement", resolution: `To be deducted from final pay · settlement ${where}` };
  return { stage: "not-in-settlement", resolution: amount ? `Not yet in the final settlement (${where}) · recompute it` : `Unresolved · settlement ${where}` };
}

/** The total involved, for the panel's summary line. */
export function redFlagTotal(flags: RedFlag[]): number {
  return flags.reduce((sum, flag) => sum + (flag.amount ?? 0), 0);
}
