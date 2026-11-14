import type { ContributionRule, ContributionRow } from "../engine/contributions";
import type { TaxBracket } from "../payroll-tax";
import type { PayFrequency } from "../engine/pay-frequency";

/**
 * Philippine statutory rates effective 2025, as DATA for a starter
 * PayrollRuleVersion (ENGINEERING.md §28: country rules live in rule data, never
 * in formulas). HR creates a new rule version when agencies publish new
 * rates; nothing here is read by the payroll engine directly.
 *
 * Sources: SSS Circular 2024-006 (15% on salary credits ₱5,000–₱35,000:
 * EE 5%, ER 10%, EC ₱10 below a ₱15,000 credit, ₱30 from it); PhilHealth
 * Circular 2020-0005 schedule for 2024–2025 (5% on ₱10,000–₱100,000,
 * shared equally); HDMF Circular 460 (EE 1% up to ₱1,500, else 2%; ER 2%;
 * on up to ₱10,000); BIR RR 11-2018 withholding tables from 2023.
 *
 * Checked 2026-11-14 against secondary sources (calculator and guide sites):
 * no 2026 change found for SSS, PhilHealth (5%, ₱10,000–₱100,000), Pag-IBIG
 * (₱10,000 cap, 2% above ₱1,500) or the TRAIN annual brackets. Those sources are
 * not agency issuances, so verify on sss.gov.ph, philhealth.gov.ph, pagibigfund.gov.ph
 * and bir.gov.ph before relying on them. Withholding brackets are the TRAIN annual
 * brackets ÷ 52 / 24 / 12, to the centavo.
 */

function sssRows(): ContributionRow[] {
  const rows: ContributionRow[] = [];
  for (let credit = 5000; credit <= 35000; credit += 500) {
    rows.push({
      from: credit === 5000 ? 0 : credit - 250,
      to: credit === 35000 ? null : credit + 249.99,
      employeeAmount: credit * 0.05,
      employerAmount: credit * 0.1,
      extraAmount: credit < 15000 ? 10 : 30,
    });
  }
  return rows;
}

const bracket = (minIncome: number, maxIncome: number | null, baseDeduction: number, rate: number): TaxBracket => ({ minIncome, maxIncome, rate, baseDeduction });

export const PH_STATUTORY_2025: {
  name: string;
  description: string;
  taxTables: { payFrequency: PayFrequency; brackets: TaxBracket[] }[];
  contributions: ContributionRule[];
} = {
  name: "Philippines 2025",
  description: "SSS 2025 table, PhilHealth 5%, Pag-IBIG (₱10,000 fund salary cap), BIR withholding tables (RR 11-2018, from 2023).",
  taxTables: [
    {
      payFrequency: "weekly",
      brackets: [
        bracket(0, 4807.69, 0, 0),
        bracket(4807.69, 7692.31, 0, 0.15),
        bracket(7692.31, 15384.62, 432.69, 0.2),
        bracket(15384.62, 38461.54, 1971.15, 0.25),
        bracket(38461.54, 153846.15, 7740.38, 0.3),
        bracket(153846.15, null, 42355.77, 0.35),
      ],
    },
    {
      payFrequency: "semi-monthly",
      brackets: [
        bracket(0, 10416.67, 0, 0),
        bracket(10416.67, 16666.67, 0, 0.15),
        bracket(16666.67, 33333.33, 937.5, 0.2),
        bracket(33333.33, 83333.33, 4270.83, 0.25),
        bracket(83333.33, 333333.33, 16770.83, 0.3),
        bracket(333333.33, null, 91770.83, 0.35),
      ],
    },
    {
      payFrequency: "monthly",
      brackets: [
        bracket(0, 20833.33, 0, 0),
        bracket(20833.33, 33333.33, 0, 0.15),
        bracket(33333.33, 66666.67, 1875, 0.2),
        bracket(66666.67, 166666.67, 8541.67, 0.25),
        bracket(166666.67, 666666.67, 33541.67, 0.3),
        bracket(666666.67, null, 183541.67, 0.35),
      ],
    },
  ],
  contributions: [
    { code: "SSS", name: "SSS", extraLabel: "EC", rows: sssRows() },
    { code: "PHIC", name: "PhilHealth", floor: 10000, ceiling: 100000, rows: [{ from: 0, employeeRate: 0.025, employerRate: 0.025 }] },
    {
      code: "HDMF",
      name: "Pag-IBIG",
      ceiling: 10000,
      rows: [
        { from: 0, to: 1500, employeeRate: 0.01, employerRate: 0.02 },
        { from: 1500.01, employeeRate: 0.02, employerRate: 0.02 },
      ],
    },
  ],
};
