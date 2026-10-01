import { cn } from "@/lib/utils";
import { HOLIDAY_TYPE_LABELS, type HolidayType } from "@/domains/holidays/holiday-types";

// Regular holidays read strongest, special non-working softer, special
// *working* days neutral (people still work). The label is always printed,
// so color is never the only cue.
const TONE: Record<HolidayType, string> = {
  regular: "bg-rose-100 text-rose-800 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-200 dark:ring-rose-500/30",
  special_non_working: "bg-amber-100 text-amber-900 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-500/30",
  special_working: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-500/15 dark:text-slate-200 dark:ring-slate-500/30",
};

/** The dot shown on a date header for that day's strongest holiday. */
export const HOLIDAY_DOT: Record<HolidayType, string> = {
  regular: "bg-rose-500",
  special_non_working: "bg-amber-500",
  special_working: "bg-slate-400",
};

export function HolidayBadge({ type, className }: { type: HolidayType; className?: string }) {
  return (
    <span className={cn("inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] font-medium whitespace-nowrap ring-1 ring-inset", TONE[type], className)}>
      {HOLIDAY_TYPE_LABELS[type]}
    </span>
  );
}

const RANK: Record<HolidayType, number> = { regular: 0, special_non_working: 1, special_working: 2 };

/** The day's most significant holiday type, for its header marker. */
export function strongestHolidayType(types: HolidayType[]): HolidayType | null {
  return types.length ? [...types].sort((a, b) => RANK[a] - RANK[b])[0] : null;
}
