/**
 * The curated palette a shift's color comes from. Light tints keep the shift
 * code readable in the grid and on paper; the code is always printed too, so
 * color is never the only way to tell shifts apart. Class strings are
 * literal so Tailwind picks them up; Excel values are ARGB.
 */
export type ShiftColor = {
  key: string;
  label: string;
  /** Grid cell / chip: tinted background + dark text, with a dark-mode pair. */
  cellClassName: string;
  /** Small solid swatch (legend, color picker). */
  swatchClassName: string;
  excelFill: string;
  excelFont: string;
};

const PALETTE: ShiftColor[] = [
  { key: "blue", label: "Blue", cellClassName: "bg-blue-100 text-blue-900 dark:bg-blue-500/25 dark:text-blue-100", swatchClassName: "bg-blue-500", excelFill: "FFDBEAFE", excelFont: "FF1E3A8A" },
  { key: "teal", label: "Teal", cellClassName: "bg-teal-100 text-teal-900 dark:bg-teal-500/25 dark:text-teal-100", swatchClassName: "bg-teal-500", excelFill: "FFCCFBF1", excelFont: "FF134E4A" },
  { key: "amber", label: "Amber", cellClassName: "bg-amber-100 text-amber-900 dark:bg-amber-500/25 dark:text-amber-100", swatchClassName: "bg-amber-500", excelFill: "FFFEF3C7", excelFont: "FF78350F" },
  { key: "violet", label: "Violet", cellClassName: "bg-violet-100 text-violet-900 dark:bg-violet-500/25 dark:text-violet-100", swatchClassName: "bg-violet-500", excelFill: "FFEDE9FE", excelFont: "FF4C1D95" },
  { key: "green", label: "Green", cellClassName: "bg-green-100 text-green-900 dark:bg-green-500/25 dark:text-green-100", swatchClassName: "bg-green-500", excelFill: "FFDCFCE7", excelFont: "FF14532D" },
  { key: "rose", label: "Rose", cellClassName: "bg-rose-100 text-rose-900 dark:bg-rose-500/25 dark:text-rose-100", swatchClassName: "bg-rose-500", excelFill: "FFFFE4E6", excelFont: "FF881337" },
  { key: "orange", label: "Orange", cellClassName: "bg-orange-100 text-orange-900 dark:bg-orange-500/25 dark:text-orange-100", swatchClassName: "bg-orange-500", excelFill: "FFFFEDD5", excelFont: "FF7C2D12" },
  { key: "indigo", label: "Indigo", cellClassName: "bg-indigo-100 text-indigo-900 dark:bg-indigo-500/25 dark:text-indigo-100", swatchClassName: "bg-indigo-500", excelFill: "FFE0E7FF", excelFont: "FF312E81" },
  { key: "cyan", label: "Cyan", cellClassName: "bg-cyan-100 text-cyan-900 dark:bg-cyan-500/25 dark:text-cyan-100", swatchClassName: "bg-cyan-500", excelFill: "FFCFFAFE", excelFont: "FF164E63" },
  { key: "lime", label: "Lime", cellClassName: "bg-lime-100 text-lime-900 dark:bg-lime-500/25 dark:text-lime-100", swatchClassName: "bg-lime-500", excelFill: "FFECFCCB", excelFont: "FF365314" },
  { key: "pink", label: "Pink", cellClassName: "bg-pink-100 text-pink-900 dark:bg-pink-500/25 dark:text-pink-100", swatchClassName: "bg-pink-500", excelFill: "FFFCE7F3", excelFont: "FF831843" },
  { key: "slate", label: "Gray", cellClassName: "bg-slate-200 text-slate-700 dark:bg-slate-500/30 dark:text-slate-200", swatchClassName: "bg-slate-400", excelFill: "FFE2E8F0", excelFont: "FF334155" },
];

const BY_KEY = new Map(PALETTE.map((color) => [color.key, color]));

export const SHIFT_COLORS: readonly ShiftColor[] = PALETTE;
export const SHIFT_COLOR_KEYS = PALETTE.map((color) => color.key) as [string, ...string[]];

/** The palette entry for a stored key; unknown or missing keys read as the neutral gray. */
export function shiftColor(key: string | null | undefined): ShiftColor {
  return (key && BY_KEY.get(key)) || BY_KEY.get("slate")!;
}

/** A new rest day is gray; a new work shift takes the first color no other shift uses (cycling once all are taken). */
export function nextShiftColor(usedKeys: string[], kind: "work" | "rest"): string {
  if (kind === "rest") return "slate";
  const workColors = SHIFT_COLOR_KEYS.filter((key) => key !== "slate");
  const used = new Set(usedKeys);
  return workColors.find((key) => !used.has(key)) ?? workColors[usedKeys.length % workColors.length];
}
