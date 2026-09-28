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

export function sumMoney(values: number[]): number {
  return roundMoney(values.reduce((sum, value) => sum + value, 0));
}
