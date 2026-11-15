import { createHash } from "node:crypto";

/**
 * Tamper evidence for an approved final settlement (ADR-032; Gate D: plain SHA-256, no key). The hash covers
 * what the pay-out is made of: version, people, lines, totals, the inputs it was computed from and HR's manual
 * lines. Approve stores it; disburse recomputes it from the stored document and refuses on a mismatch. It
 * catches edits made outside the workflow; it does not stop someone who can rewrite the database and the hash.
 */
export type HashableSettlement = {
  version: number;
  employeeId: unknown;
  clearanceCaseId: unknown;
  lines: unknown[];
  totals?: unknown;
  inputs?: unknown;
  manualLines: { _id?: unknown; direction: string; label: string; amount: number; reason: string; taxable?: boolean | null; documentId?: unknown }[];
};

/** JSON with sorted keys, ids as strings, numbers to the centavo and dates as ISO strings, so the same content always hashes the same. */
function canonical(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return Math.round(value * 100) / 100;
  if (typeof value === "object" && typeof (value as { toHexString?: unknown }).toHexString === "function") return String(value);
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key, item]) => item !== undefined && key !== "computedAt")
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(entries.map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

export function settlementHash(settlement: HashableSettlement): string {
  const plain = (value: unknown) => (value && typeof (value as { toObject?: unknown }).toObject === "function" ? (value as { toObject: () => unknown }).toObject() : value);
  const content = {
    version: settlement.version,
    employeeId: String(settlement.employeeId),
    clearanceCaseId: String(settlement.clearanceCaseId),
    lines: settlement.lines.map(plain),
    totals: plain(settlement.totals),
    inputs: plain(settlement.inputs),
    manualLines: settlement.manualLines.map((line) => ({
      id: line._id ? String(line._id) : null,
      direction: line.direction,
      label: line.label,
      amount: line.amount,
      reason: line.reason,
      taxable: line.taxable ?? null,
      documentId: line.documentId ? String(line.documentId) : null,
    })),
  };
  return createHash("sha256").update(JSON.stringify(canonical(content))).digest("hex");
}
