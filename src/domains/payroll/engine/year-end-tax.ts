// Year-end withholding reconciliation and the Form 2316 amounts (payroll plan Phase 4, Gate C
// 2026-11-14). Pure: the caller gathers the year's pay lines; the box map, the annual table and the
// benefits cap are rule-version data, never constants here (ENGINEERING.md §28).
import { computeProgressiveBracketTax, type TaxBracket } from "../payroll-tax";
import { roundMoney, sumMoney } from "./money";

/** Special code in a box's `codes`: the employee's share of SSS, PhilHealth and Pag-IBIG. */
export const CONTRIBUTIONS_CODE = "@contributions";
/** Special code in a box's `codes`: any line no earlier box took. */
export const ANY_CODE = "*";

export type Form2316Box = {
  box: string;
  label: string;
  /** Whether the box is in the form's non-taxable/exempt part or its taxable part. */
  part: "non_taxable" | "taxable";
  /** Earning codes or adjustment categories, `@contributions` or `*`. The first box that matches a line takes it. */
  codes: string[];
  /** Only lines paid while the employee was (or wasn't) a minimum wage earner. Default: any. */
  minimumWage?: "any" | "mwe" | "non_mwe" | null;
  /** Only lines flagged taxable (or not) on the payslip. Default: any. */
  taxable?: "any" | "yes" | "no" | null;
  /** Employee contributions come off this box (the basic salary box): the form reports basic net of them. */
  lessContributions?: boolean | null;
  /** The benefits box (13th month and other benefits): exempt up to the cap; the excess moves to `overflowTo`. */
  capped?: boolean | null;
  overflowTo?: string | null;
};

/** One pay line of the year, with whether the employee was a minimum wage earner when it was paid. */
export type YearLine = { code: string; amount: number; taxable: boolean; minimumWage: boolean };

export type Form2316Amounts = {
  /** Amount per box number, every box in the map (0 when nothing landed there). */
  boxes: Record<string, number>;
  nonTaxableTotal: number;
  taxableTotal: number;
  gross: number;
  /** Non-taxable benefits above the cap, moved to the taxable part. */
  benefitsExcess: number;
  /** Line codes no box took (the map has no catch-all for them); left out of every total. */
  unmapped: string[];
};

function matches(box: Form2316Box, line: YearLine) {
  const wage = box.minimumWage ?? "any";
  if (wage === "mwe" && !line.minimumWage) return false;
  if (wage === "non_mwe" && line.minimumWage) return false;
  const taxable = box.taxable ?? "any";
  if (taxable === "yes" && !line.taxable) return false;
  if (taxable === "no" && line.taxable) return false;
  return box.codes.includes(line.code) || box.codes.includes(ANY_CODE);
}

/**
 * Sorts a year of pay lines into the form's boxes.
 * - `excludedCodes` are not compensation (reimbursements, the year-end tax line itself) and go nowhere.
 * - Contributions land in the `@contributions` box and come off the basic box that matches the
 *   employee's minimum-wage status when they were paid.
 * - The capped box keeps up to `benefitsCap`; the rest moves to its `overflowTo` box (taxable).
 */
export function form2316Amounts(input: {
  lines: YearLine[];
  contributions: { amount: number; minimumWage: boolean }[];
  boxes: Form2316Box[];
  excludedCodes: string[];
  benefitsCap: number | null;
}): Form2316Amounts {
  const amounts = new Map<string, number[]>(input.boxes.map((box) => [box.box, []]));
  const unmapped = new Set<string>();
  const add = (box: string, amount: number) => amounts.get(box)?.push(amount);

  for (const line of input.lines) {
    if (input.excludedCodes.includes(line.code) || line.amount === 0) continue;
    const box = input.boxes.find((candidate) => !candidate.codes.includes(CONTRIBUTIONS_CODE) && matches(candidate, line));
    if (box) add(box.box, line.amount);
    else unmapped.add(line.code);
  }

  const contributionsBox = input.boxes.find((box) => box.codes.includes(CONTRIBUTIONS_CODE));
  for (const contribution of input.contributions) {
    if (!contribution.amount) continue;
    if (contributionsBox) add(contributionsBox.box, contribution.amount);
    const basic = input.boxes.find((box) => box.lessContributions && matches({ ...box, codes: [ANY_CODE], taxable: "any" }, { code: "", amount: 0, taxable: true, minimumWage: contribution.minimumWage }));
    if (basic) add(basic.box, -contribution.amount);
  }

  const totals: Record<string, number> = Object.fromEntries([...amounts].map(([box, values]) => [box, sumMoney(values)]));
  let benefitsExcess = 0;
  const capped = input.boxes.find((box) => box.capped);
  if (capped && input.benefitsCap != null && totals[capped.box] > input.benefitsCap) {
    benefitsExcess = roundMoney(totals[capped.box] - input.benefitsCap);
    totals[capped.box] = input.benefitsCap;
    if (capped.overflowTo && capped.overflowTo in totals) totals[capped.overflowTo] = sumMoney([totals[capped.overflowTo], benefitsExcess]);
  }

  const partTotal = (part: Form2316Box["part"]) => sumMoney(input.boxes.filter((box) => box.part === part).map((box) => totals[box.box]));
  const nonTaxableTotal = partTotal("non_taxable");
  const taxableTotal = partTotal("taxable");
  return { boxes: totals, nonTaxableTotal, taxableTotal, gross: sumMoney([nonTaxableTotal, taxableTotal]), benefitsExcess, unmapped: [...unmapped].sort() };
}

export type Annualization = {
  presentTaxable: number;
  previousTaxable: number;
  grossTaxable: number;
  taxDue: number;
  presentWithheld: number;
  previousWithheld: number;
  withheld: number;
  /** Tax due − withheld: positive is still to collect, negative is to refund. */
  difference: number;
};

/**
 * RR 11-2018 annualization (as the payroll plan reads it; Gate C [verify]): tax on the year's taxable
 * compensation from this employer and any previous one, by the annual table, less everything withheld.
 * A negative taxable total (more contributions than taxable pay) counts as zero.
 */
export function annualizeTax(input: { presentTaxable: number; previousTaxable: number; presentWithheld: number; previousWithheld: number; annualTable: TaxBracket[] }): Annualization {
  const presentTaxable = Math.max(0, roundMoney(input.presentTaxable));
  const previousTaxable = roundMoney(input.previousTaxable);
  const grossTaxable = sumMoney([presentTaxable, previousTaxable]);
  const taxDue = roundMoney(computeProgressiveBracketTax(grossTaxable, input.annualTable));
  const withheld = sumMoney([input.presentWithheld, input.previousWithheld]);
  return {
    presentTaxable,
    previousTaxable,
    grossTaxable,
    taxDue,
    presentWithheld: roundMoney(input.presentWithheld),
    previousWithheld: roundMoney(input.previousWithheld),
    withheld,
    difference: roundMoney(taxDue - withheld),
  };
}
