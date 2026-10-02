import { formatCalendarDate } from "@/lib/date-key";

const SHORT_DATE = { month: "short", day: "numeric", year: "numeric" } as const;

/**
 * "Mar 4, 2025", or "—" when there's no date. For calendar dates stored as
 * UTC midnight (hired, contract end, effective from, issued); instants such
 * as an upload time go through `formatDate` in `@/lib/app-time`.
 */
export const formatDate = (value: Date | string | null | undefined) => (value ? formatCalendarDate(value, SHORT_DATE) : "—");

/** A labelled value in a profile card. */
export function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      {/* Long unbroken names ("Administrator/Property Manager") wrap instead of spilling into the next column. */}
      <dd className="text-sm font-medium [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}
