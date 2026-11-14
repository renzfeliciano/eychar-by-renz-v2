import { roundMoney } from "@/domains/payroll/engine/money";
import { formatMoney } from "@/lib/money";

/**
 * Whether a settlement still deducts exactly what its clearance has flagged
 * (HR concerns deck, Nov 2026: no final pay goes out with a red flag left
 * unsettled). A settlement copies the clearance's flagged amounts when it is
 * prepared; an item flagged, re-amounted, cleared or waived afterwards makes
 * that copy stale, and the settlement must be recomputed before it moves on.
 * Pure, so the rule is tested directly.
 */

export type AccountabilityDrift = {
  itemId: string;
  title: string;
  /** Flagged with an amount but not deducted; deducted at a different amount; deducted but no longer flagged. */
  kind: "missing" | "amount-changed" | "no-longer-flagged";
  flaggedAmount: number | null;
  deductedAmount: number | null;
};

type ClearanceItem = { _id: { toString(): string }; title: string; status: string; amount?: number | null };
type SettlementLine = { code: string; direction?: string; amount: number; label?: string; clearanceItemId?: string | null };

export function accountabilityDrift(items: ClearanceItem[], lines: SettlementLine[]): AccountabilityDrift[] {
  const deducted = new Map<string, SettlementLine>();
  for (const line of lines) if (line.code === "accountability" && line.clearanceItemId) deducted.set(line.clearanceItemId, line);

  const drift: AccountabilityDrift[] = [];
  for (const item of items) {
    const itemId = item._id.toString();
    const flaggedAmount = item.status === "flagged" && (item.amount ?? 0) > 0 ? roundMoney(item.amount ?? 0) : null;
    const line = deducted.get(itemId);
    deducted.delete(itemId);
    if (flaggedAmount === null && !line) continue;
    if (flaggedAmount !== null && !line) drift.push({ itemId, title: item.title, kind: "missing", flaggedAmount, deductedAmount: null });
    else if (flaggedAmount === null && line) drift.push({ itemId, title: item.title, kind: "no-longer-flagged", flaggedAmount: null, deductedAmount: line.amount });
    else if (line && flaggedAmount !== roundMoney(line.amount)) drift.push({ itemId, title: item.title, kind: "amount-changed", flaggedAmount, deductedAmount: line.amount });
  }
  // A deduction whose checklist item is gone from the clearance altogether.
  for (const [itemId, line] of deducted) drift.push({ itemId, title: line.label ?? "Clearance item", kind: "no-longer-flagged", flaggedAmount: null, deductedAmount: line.amount });
  return drift;
}

/** One line per difference, for error messages and the settlement page. */
export function describeDrift(entry: AccountabilityDrift): string {
  switch (entry.kind) {
    case "missing":
      return `${entry.title}: flagged at ${formatMoney(entry.flaggedAmount ?? 0)} but not deducted`;
    case "amount-changed":
      return `${entry.title}: flagged at ${formatMoney(entry.flaggedAmount ?? 0)} but deducted at ${formatMoney(entry.deductedAmount ?? 0)}`;
    case "no-longer-flagged":
      return `${entry.title}: deducted ${formatMoney(entry.deductedAmount ?? 0)} but no longer flagged`;
  }
}
