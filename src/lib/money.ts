/**
 * Money: one rounding rule and one display format for every screen,
 * export and generated message (payroll, clearance, final settlements).
 */

/**
 * Centavo rounding, half away from zero (the convention on payslips).
 * Scaling by 100 first exposes binary float noise (114.945 × 100 is
 * 11494.499999…), so the scaled value is re-read at 12 significant digits
 * before rounding.
 */
export function roundMoney(value: number): number {
  const scaled = Number((Math.abs(value) * 100).toPrecision(12));
  const rounded = Math.round(scaled) / 100;
  return value < 0 ? -rounded : rounded;
}

/**
 * The platform's display currency. A single constant until currency becomes
 * organization configuration; every amount still formats through
 * `formatMoney`, so that change is one place.
 */
const MONEY_FORMAT = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const AMOUNT_FORMAT = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Rounded to the centavo; a value that rounds to zero is plain zero, never "-0". */
function rounded(value: number): number {
  const result = roundMoney(Number.isFinite(value) ? value : 0);
  return result === 0 ? 0 : result;
}

/** "₱1,234.50", "-₱1,234.50", "₱0.00". */
export function formatMoney(value: number): string {
  return MONEY_FORMAT.format(rounded(value));
}

/** The same amount without the symbol: "1,234.50", "-1,234.50". */
export function formatAmount(value: number): string {
  return AMOUNT_FORMAT.format(rounded(value));
}
