/**
 * Suggested adjustment categories with their usual direction and tax
 * treatment in the Philippines. Suggestions only: HR can change the label or
 * the taxable flag on each line, and any other category code is accepted
 * (AGENTS.md §10). 13th month pay and other benefits are exempt up to
 * ₱90,000 a year; past that, mark the excess taxable.
 */
export const ADJUSTMENT_CATEGORIES = [
  { code: "overtime", label: "Overtime", direction: "earning", taxable: true },
  { code: "holiday_pay", label: "Holiday pay", direction: "earning", taxable: true },
  { code: "rest_day_pay", label: "Rest day pay", direction: "earning", taxable: true },
  { code: "night_differential", label: "Night differential", direction: "earning", taxable: true },
  { code: "bonus", label: "Bonus", direction: "earning", taxable: true },
  { code: "thirteenth_month", label: "13th month pay", direction: "earning", taxable: false },
  { code: "de_minimis", label: "De minimis benefit", direction: "earning", taxable: false },
  { code: "reimbursement", label: "Reimbursement", direction: "earning", taxable: false },
  { code: "retro_pay", label: "Salary adjustment (retro)", direction: "earning", taxable: true },
  { code: "other_earning", label: "Other earning", direction: "earning", taxable: true },
  { code: "sss_loan", label: "SSS loan", direction: "deduction", taxable: false },
  { code: "pagibig_loan", label: "Pag-IBIG loan", direction: "deduction", taxable: false },
  { code: "company_loan", label: "Company loan", direction: "deduction", taxable: false },
  { code: "cash_advance", label: "Cash advance", direction: "deduction", taxable: false },
  { code: "other_deduction", label: "Other deduction", direction: "deduction", taxable: false },
] as const satisfies readonly { code: string; label: string; direction: "earning" | "deduction"; taxable: boolean }[];
