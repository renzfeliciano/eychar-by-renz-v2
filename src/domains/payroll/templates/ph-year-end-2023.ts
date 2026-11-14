import type { TaxBracket } from "../payroll-tax";
import type { Form2316Box } from "../engine/year-end-tax";

/**
 * Philippine year-end tax data for a rule version (payroll plan Phase 4, Gate C approved as drafted
 * 2026-11-14). Data, not code: a new BIR form or rate is a new rule version.
 *
 * - Annual table: TRAIN (RA 10963) brackets from 2023, as in knowledge/philippine-payroll-compliance.md.
 *   Secondary sources only [verify on bir.gov.ph].
 * - Benefits cap: ₱90,000 for 13th month pay and other benefits (RA 10963) [verify].
 * - Box map: BIR Form 2316 (January 2018 version) as remembered at Gate C. Box numbers and labels
 *   [verify against the current form]; see knowledge/plans/payroll-phase-4-year-end-tax.md.
 */
const bracket = (minIncome: number, maxIncome: number | null, baseDeduction: number, rate: number): TaxBracket => ({ minIncome, maxIncome, rate, baseDeduction });

const MWE_EXEMPT_BASIC = ["basic", "absences", "tardiness"];

export const PH_YEAR_END_2023: {
  annualTaxTable: TaxBracket[];
  benefitsExemptionCap: number;
  form2316Boxes: Form2316Box[];
  form2316Excluded: string[];
} = {
  annualTaxTable: [
    bracket(0, 250000, 0, 0),
    bracket(250000, 400000, 0, 0.15),
    bracket(400000, 800000, 22500, 0.2),
    bracket(800000, 2000000, 102500, 0.25),
    bracket(2000000, 8000000, 402500, 0.3),
    bracket(8000000, null, 2202500, 0.35),
  ],
  benefitsExemptionCap: 90000,
  form2316Boxes: [
    // Non-taxable / exempt (Part IV-B A)
    { box: "29", label: "Basic salary / statutory minimum wage (MWE)", part: "non_taxable", codes: MWE_EXEMPT_BASIC, minimumWage: "mwe", lessContributions: true },
    { box: "30", label: "Holiday pay (MWE)", part: "non_taxable", codes: ["holiday_pay", "rest_day_pay"], minimumWage: "mwe" },
    { box: "31", label: "Overtime pay (MWE)", part: "non_taxable", codes: ["overtime"], minimumWage: "mwe" },
    { box: "32", label: "Night shift differential (MWE)", part: "non_taxable", codes: ["night_differential"], minimumWage: "mwe" },
    { box: "33", label: "Hazard pay (MWE)", part: "non_taxable", codes: ["hazard_pay"], minimumWage: "mwe" },
    { box: "34", label: "13th month pay and other benefits", part: "non_taxable", codes: ["thirteenth_month", "bonus"], taxable: "no", capped: true, overflowTo: "48" },
    { box: "35", label: "De minimis benefits", part: "non_taxable", codes: ["de_minimis", "allowance"], taxable: "no" },
    { box: "36", label: "SSS, GSIS, PhilHealth and Pag-IBIG contributions (employee share)", part: "non_taxable", codes: ["@contributions"] },
    { box: "37", label: "Salaries and other forms of compensation (non-taxable)", part: "non_taxable", codes: ["*"], taxable: "no" },
    // Taxable (Part IV-B B)
    { box: "39", label: "Basic salary", part: "taxable", codes: MWE_EXEMPT_BASIC, minimumWage: "non_mwe", lessContributions: true },
    { box: "40", label: "Representation", part: "taxable", codes: [] },
    { box: "41", label: "Transportation", part: "taxable", codes: [] },
    { box: "42", label: "Cost of living allowance", part: "taxable", codes: [] },
    { box: "43", label: "Fixed housing allowance", part: "taxable", codes: [] },
    { box: "44", label: "Others (regular)", part: "taxable", codes: ["allowance"] },
    { box: "45", label: "Commission", part: "taxable", codes: ["commission"] },
    { box: "46", label: "Profit sharing", part: "taxable", codes: ["profit_sharing"] },
    { box: "47", label: "Fees including director's fees", part: "taxable", codes: ["fees"] },
    { box: "48", label: "Taxable 13th month pay and other benefits", part: "taxable", codes: ["thirteenth_month", "bonus"] },
    { box: "49", label: "Hazard pay", part: "taxable", codes: ["hazard_pay"] },
    { box: "50", label: "Overtime pay", part: "taxable", codes: ["overtime", "holiday_pay", "rest_day_pay", "night_differential"] },
    { box: "51", label: "Others (supplementary)", part: "taxable", codes: ["*"] },
  ],
  // Not compensation: reimbursements, and the year-end lines themselves (they settle tax, they aren't pay).
  form2316Excluded: ["reimbursement", "year_end_tax", "year_end_tax_refund"],
};
