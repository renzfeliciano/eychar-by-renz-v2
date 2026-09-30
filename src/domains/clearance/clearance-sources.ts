/**
 * Automatic checks for clearance items (ADR-031 phase 2): facts the app
 * already knows, so nobody has to tick them by hand.
 * - assets: clears once nothing issued to the employee is still out;
 * - account_access: clears once every account linked to them is disabled;
 * - travel_orders: shown for reference only. Travel orders don't record
 *   advances or liquidation, so a person still signs that item off.
 */
export const CLEARANCE_AUTO_SOURCES = ["assets", "account_access", "travel_orders"] as const;
export type ClearanceAutoSource = (typeof CLEARANCE_AUTO_SOURCES)[number];

export const AUTO_SOURCE_LABELS: Record<ClearanceAutoSource, string> = {
  assets: "Issued assets",
  account_access: "System accounts",
  travel_orders: "Travel orders (reference)",
};

export type SourceFact = { id: string; label: string };
export type SourceFacts = { unreturnedAssets: SourceFact[]; unfinishedTravel: SourceFact[]; activeAccounts: SourceFact[] };
export type SourceEvaluation = { satisfied: boolean; autoClears: boolean; summary: string; details: string[] };

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

export function evaluateSource(source: ClearanceAutoSource, facts: SourceFacts): SourceEvaluation {
  if (source === "assets") {
    const open = facts.unreturnedAssets;
    return {
      satisfied: open.length === 0,
      autoClears: true,
      summary: open.length ? `${plural(open.length, "asset")} still issued` : "All issued assets returned",
      details: open.map((fact) => fact.label),
    };
  }
  if (source === "account_access") {
    const open = facts.activeAccounts;
    return {
      satisfied: open.length === 0,
      autoClears: true,
      summary: open.length ? `${plural(open.length, "account")} still active` : "No active accounts",
      details: open.map((fact) => fact.label),
    };
  }
  const open = facts.unfinishedTravel;
  return {
    satisfied: open.length === 0,
    autoClears: false,
    summary: open.length ? `${plural(open.length, "travel order")} not finished` : "No unfinished travel orders",
    details: open.map((fact) => fact.label),
  };
}
