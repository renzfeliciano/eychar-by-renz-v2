import { roundMoney } from "./money";

/**
 * One row of a contribution table: the salary range it covers, then either
 * fixed amounts (SSS's salary-credit table) or rates applied to the base
 * (PhilHealth, Pag-IBIG). `extraAmount` is an employer-only add-on such as
 * SSS's Employees' Compensation (EC).
 */
export type ContributionRow = {
  from: number;
  to?: number | null;
  employeeRate?: number | null;
  employerRate?: number | null;
  employeeAmount?: number | null;
  employerAmount?: number | null;
  extraAmount?: number | null;
};

/**
 * A government contribution as data, never as a formula in code (AGENTS.md
 * §28). The base is the employee's monthly basic pay, clamped between
 * `floor` and `ceiling` before rates apply; rows are matched on the
 * unclamped salary.
 */
export type ContributionRule = {
  code: string;
  name: string;
  floor?: number | null;
  ceiling?: number | null;
  extraLabel?: string | null;
  rows: ContributionRow[];
};

export type MonthlyContribution = { employee: number; employer: number; extra: number };

function clamp(value: number, floor?: number | null, ceiling?: number | null): number {
  let result = value;
  if (floor != null) result = Math.max(result, floor);
  if (ceiling != null) result = Math.min(result, ceiling);
  return result;
}

/** Monthly amounts, unrounded, so a per-cutoff share can be taken before rounding once. */
export function computeMonthlyContributionExact(rule: ContributionRule, monthlyBase: number): MonthlyContribution {
  const row = rule.rows.find((candidate) => monthlyBase >= candidate.from && (candidate.to == null || monthlyBase <= candidate.to));
  if (!row) return { employee: 0, employer: 0, extra: 0 };
  const base = clamp(monthlyBase, rule.floor, rule.ceiling);
  return {
    employee: row.employeeAmount ?? (row.employeeRate ?? 0) * base,
    employer: row.employerAmount ?? (row.employerRate ?? 0) * base,
    extra: row.extraAmount ?? 0,
  };
}

export function computeMonthlyContribution(rule: ContributionRule, monthlyBase: number): MonthlyContribution {
  const exact = computeMonthlyContributionExact(rule, monthlyBase);
  return { employee: roundMoney(exact.employee), employer: roundMoney(exact.employer), extra: roundMoney(exact.extra) };
}
