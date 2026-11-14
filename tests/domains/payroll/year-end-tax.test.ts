import { describe, it, expect } from "vitest";
import { annualizeTax, form2316Amounts, type Form2316Box, type YearLine } from "@/domains/payroll/engine/year-end-tax";
import { PH_YEAR_END_2023 } from "@/domains/payroll/templates/ph-year-end-2023";

const { annualTaxTable, benefitsExemptionCap, form2316Boxes, form2316Excluded } = PH_YEAR_END_2023;
const repeat = <T,>(count: number, value: T) => Array.from({ length: count }, () => value);
const line = (code: string, amount: number, taxable = true, minimumWage = false): YearLine => ({ code, amount, taxable, minimumWage });

function yearOf(lines: YearLine[], contributions: { amount: number; minimumWage: boolean }[]) {
  return form2316Amounts({ lines, contributions, boxes: form2316Boxes, excludedCodes: form2316Excluded, benefitsCap: benefitsExemptionCap });
}

describe("year-end tax: the Gate C hand-worked examples (payroll plan Phase 4)", () => {
  it("A: ₱30,000/month all year, withheld every cutoff → nothing to settle", () => {
    const amounts = yearOf(repeat(24, line("basic", 15000)), repeat(24, { amount: 1225, minimumWage: false }));
    expect(amounts.boxes).toMatchObject({ "36": 29400, "39": 330600, "29": 0 });
    expect(amounts).toMatchObject({ nonTaxableTotal: 29400, taxableTotal: 330600, gross: 360000, benefitsExcess: 0, unmapped: [] });

    const result = annualizeTax({ presentTaxable: amounts.taxableTotal, previousTaxable: 0, presentWithheld: 24 * 503.75, previousWithheld: 0, annualTable: annualTaxTable });
    expect(result).toMatchObject({ grossTaxable: 330600, taxDue: 12090, withheld: 12090, difference: 0 });
  });

  it("B: hired Jul 1 at ₱40,000/month with ₱180,000 from a previous employer → collect ₱7,249.96", () => {
    const amounts = yearOf(repeat(12, line("basic", 20000)), repeat(12, { amount: 1475, minimumWage: false }));
    expect(amounts.taxableTotal).toBe(222300);

    const result = annualizeTax({ presentTaxable: amounts.taxableTotal, previousTaxable: 180000, presentWithheld: 12 * 1309.17, previousWithheld: 0, annualTable: annualTaxTable });
    expect(result).toMatchObject({ grossTaxable: 402300, taxDue: 22960, withheld: 15710.04, difference: 7249.96 });

    // Without the previous employer the same year would wrongly refund everything withheld.
    expect(annualizeTax({ presentTaxable: 222300, previousTaxable: 0, presentWithheld: 15710.04, previousWithheld: 0, annualTable: annualTaxTable }).difference).toBe(-15710.04);
  });

  it("C: a minimum wage earner's pay is all exempt; contributions come off the minimum-wage box", () => {
    const amounts = yearOf([line("basic", 169650, true, true), line("overtime", 2000, true, true), line("holiday_pay", 1300, true, true)], repeat(12, { amount: 1000, minimumWage: true }));
    expect(amounts.boxes).toMatchObject({ "29": 157650, "30": 1300, "31": 2000, "36": 12000, "39": 0, "50": 0 });
    expect(amounts).toMatchObject({ taxableTotal: 0, nonTaxableTotal: 172950, gross: 172950 });
    expect(annualizeTax({ presentTaxable: 0, previousTaxable: 0, presentWithheld: 0, previousWithheld: 0, annualTable: annualTaxTable })).toMatchObject({ taxDue: 0, difference: 0 });
  });
});

describe("Form 2316 box map", () => {
  it("caps 13th month and other benefits at ₱90,000 and moves the excess to the taxable benefits box (Gate C Q3)", () => {
    const amounts = yearOf([line("basic", 600000), line("thirteenth_month", 100000, false), line("bonus", 5000, false)], []);
    expect(amounts.boxes).toMatchObject({ "34": 90000, "48": 15000, "39": 600000 });
    expect(amounts).toMatchObject({ benefitsExcess: 15000, taxableTotal: 615000, nonTaxableTotal: 90000, gross: 705000 });
  });

  it("sorts allowances by taxability, leaves out reimbursements and the year-end lines, and catches the rest", () => {
    const amounts = yearOf(
      [line("allowance", 2000, false), line("allowance", 3000, true), line("reimbursement", 900, false), line("year_end_tax_refund", 500, false), line("signing_bonus", 700, true), line("gift", 400, false)],
      [],
    );
    expect(amounts.boxes).toMatchObject({ "35": 2000, "44": 3000, "51": 700, "37": 400 });
    expect(amounts.gross).toBe(6100);
    expect(amounts.unmapped).toEqual([]);
  });

  it("reports lines a map without a catch-all can't place, and leaves them out of the totals", () => {
    const boxes: Form2316Box[] = [{ box: "39", label: "Basic salary", part: "taxable", codes: ["basic"] }];
    const amounts = form2316Amounts({ lines: [line("basic", 1000), line("commission", 50)], contributions: [], boxes, excludedCodes: [], benefitsCap: null });
    expect(amounts).toMatchObject({ taxableTotal: 1000, unmapped: ["commission"] });
  });

  it("counts a year with more contributions than taxable pay as zero taxable", () => {
    const amounts = yearOf([line("basic", 1000)], [{ amount: 1500, minimumWage: false }]);
    expect(amounts.taxableTotal).toBe(-500);
    expect(annualizeTax({ presentTaxable: amounts.taxableTotal, previousTaxable: 0, presentWithheld: 0, previousWithheld: 0, annualTable: annualTaxTable })).toMatchObject({ presentTaxable: 0, taxDue: 0 });
  });
});
