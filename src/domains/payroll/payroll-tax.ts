export type TaxBracket = { minIncome: number; maxIncome?: number | null; rate: number; baseDeduction: number };

/**
 * Standard progressive-bracket formula: find the bracket whose
 * [minIncome, maxIncome) covers the income, then baseDeduction + rate *
 * (income - minIncome). The formula is generic — it works for any
 * country's bracket table, since the brackets themselves are data
 * (AGENTS.md §28: never hardcode salary * 0.05 in code).
 */
export function computeProgressiveBracketTax(taxableIncome: number, brackets: TaxBracket[]): number {
  if (taxableIncome <= 0 || brackets.length === 0) return 0;

  const bracket = brackets.find(
    (candidate) =>
      taxableIncome >= candidate.minIncome &&
      (candidate.maxIncome == null || taxableIncome < candidate.maxIncome),
  );
  if (!bracket) return 0;

  return bracket.baseDeduction + bracket.rate * (taxableIncome - bracket.minIncome);
}
