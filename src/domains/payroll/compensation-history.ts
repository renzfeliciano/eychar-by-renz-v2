import { dateToDateKey } from "@/lib/date-key";
import { roundMoney } from "./engine/money";

/**
 * The rate payroll pays: the basic salary (or daily rate) plus the annual
 * increase entered with it. Each employee's increase is entered by hand,
 * since it isn't the same for everyone. Terms entered as a plain rate count
 * as a basic with no increase.
 */
export function compensationTotal(terms: { rate?: number; baseRate?: number; annualIncrease?: number }): { baseRate: number; annualIncrease: number; rate: number } {
  const baseRate = terms.baseRate ?? terms.rate ?? 0;
  const annualIncrease = terms.annualIncrease ?? 0;
  return { baseRate, annualIncrease, rate: roundMoney(baseRate + annualIncrease) };
}

type HistoryRow = {
  _id: { toString(): string };
  rateType: string;
  rate: number;
  baseRate?: number | null;
  annualIncrease?: number | null;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  reason?: string | null;
};

export type CompensationHistoryEntry = {
  id: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  rateType: string;
  /** The total in force before this change; null for the first terms. */
  previousRate: number | null;
  baseRate: number;
  annualIncrease: number;
  /** The new total: basic plus increase. */
  rate: number;
  /** New total minus the previous one; null for the first terms. */
  change: number | null;
  reason: string | null;
};

/** Every pay change for one employee, newest first, each with the salary it replaced. */
export function compensationHistory(rows: HistoryRow[]): CompensationHistoryEntry[] {
  const ordered = [...rows].sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime());
  return ordered
    .map((row, index) => {
      const previousRate = index > 0 ? ordered[index - 1].rate : null;
      return {
        id: row._id.toString(),
        effectiveFrom: dateToDateKey(row.effectiveFrom),
        effectiveTo: row.effectiveTo ? dateToDateKey(row.effectiveTo) : null,
        rateType: row.rateType,
        previousRate,
        baseRate: row.baseRate ?? row.rate,
        annualIncrease: row.annualIncrease ?? 0,
        rate: row.rate,
        change: previousRate === null ? null : roundMoney(row.rate - previousRate),
        reason: row.reason || null,
      };
    })
    .reverse();
}
