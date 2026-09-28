import type { ContributionRule, ContributionRow } from "../engine/contributions";
import type { TaxBracket } from "../payroll-tax";
import type { PayFrequency } from "../engine/pay-frequency";

/**
 * Philippine statutory rates effective 2025, as DATA for a starter
 * PayrollRuleVersion (AGENTS.md §28: country rules live in rule data, never
 * in formulas). HR creates a new rule version when agencies publish new
 * rates; nothing here is read by the payroll engine directly.
 *
 * Sources: SSS Circular 2024-006 (15% on salary credits ₱5,000–₱35,000:
 * EE 5%, ER 10%, EC ₱10 below a ₱15,000 credit, ₱30 from it); PhilHealth
 * Circular 2020-0005 schedule for 2024–2025 (5% on ₱10,000–₱100,000,
 * shared equally); HDMF Circular 460 (EE 1% up to ₱1,500, else 2%; ER 2%;
 * on up to ₱10,000); BIR RR 11-2018 withholding tables from 2023.
 * Verify against the agencies' current issuances before relying on them.
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
        bracket(0, 4808, 0, 0),
        bracket(4808, 7692, 0, 0.15),
        bracket(7692, 15385, 432.6, 0.2),
        bracket(15385, 38462, 1971.2, 0.25),
        bracket(38462, 153846, 7740.45, 0.3),
        bracket(153846, null, 42355.65, 0.35),
      ],
    },
    {
      payFrequency: "semi-monthly",
      brackets: [
        bracket(0, 10417, 0, 0),
        bracket(10417, 16667, 0, 0.15),
        bracket(16667, 33333, 937.5, 0.2),
        bracket(33333, 83333, 4270.7, 0.25),
        bracket(83333, 333333, 16770.7, 0.3),
        bracket(333333, null, 91770.7, 0.35),
      ],
    },
    {
      payFrequency: "monthly",
      brackets: [
        bracket(0, 20833, 0, 0),
        bracket(20833, 33333, 0, 0.15),
        bracket(33333, 66667, 1875, 0.2),
        bracket(66667, 166667, 8541.8, 0.25),
        bracket(166667, 666667, 33541.8, 0.3),
        bracket(666667, null, 183541.8, 0.35),
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
