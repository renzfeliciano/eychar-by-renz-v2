import { roundMoney } from "@/lib/money";

/** Centavo rounding lives with money formatting in `@/lib/money`, so displays and the engine round alike. */
export { roundMoney };

export function sumMoney(values: number[]): number {
  return roundMoney(values.reduce((sum, value) => sum + value, 0));
}
