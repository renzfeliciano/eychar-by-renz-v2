import Link from "next/link";
import { Plane, Palmtree } from "lucide-react";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { attendanceSegments, type AttendanceCounts } from "@/domains/dashboard/dashboard-summary";

// Status colors, each always shown with its word in the legend below — the
// bar is never the only place a status can be read from.
const SEGMENT_COLOR: Record<keyof AttendanceCounts, string> = {
  present: "var(--success)",
  late: "var(--warning)",
  absent: "var(--destructive)",
  onLeave: "var(--primary)",
  notRecorded: "var(--viz-gridline)",
};

export function TodayPanel({
  dateLabel,
  attendance,
  onLeave,
  travelling,
}: {
  dateLabel: string;
  /** Null when the user can't read attendance. */
  attendance: (AttendanceCounts & { staff: number }) | null;
  /** Null when the user can't read that module. */
  onLeave: number | null;
  travelling: number | null;
}) {
  const segments = attendance ? attendanceSegments(attendance) : [];
  const atWork = attendance ? attendance.present + attendance.late : 0;

  return (
    <Card className="h-full">
      <CardHeader className="border-b">
        <CardTitle className="text-base">Today</CardTitle>
        <CardDescription>{dateLabel}</CardDescription>
        {attendance && (
          <CardAction>
            <Link href="/attendance" className="text-xs font-medium text-primary hover:underline">
              Daily roster
            </Link>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {attendance && (
          <div className="flex flex-col gap-3">
            <p className="flex items-baseline gap-1.5">
              <span className="text-3xl font-semibold tracking-tight tabular-nums">{atWork}</span>
              <span className="text-sm text-muted-foreground">of {attendance.staff} staff at work</span>
            </p>
            {segments.length > 0 ? (
              <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={segments.map((segment) => `${segment.label}: ${segment.count}`).join(", ")}>
                {segments.map((segment) => (
                  <span
                    key={segment.key}
                    className="h-full first:rounded-l-full last:rounded-r-full"
                    style={{ width: `${segment.share}%`, backgroundColor: SEGMENT_COLOR[segment.key] }}
                    title={`${segment.label}: ${segment.count} (${segment.share}%)`}
                  />
                ))}
              </div>
            ) : (
              <div className="h-2.5 w-full rounded-full bg-muted" aria-hidden="true" />
            )}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              {(
                [
                  ["present", "Present"],
                  ["late", "Late"],
                  ["absent", "Absent"],
                  ["onLeave", "On leave"],
                  ["notRecorded", "Not recorded"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: SEGMENT_COLOR[key] }} aria-hidden="true" />
                  <dt className="flex-1 truncate text-muted-foreground">{label}</dt>
                  <dd className="font-medium tabular-nums">{attendance[key]}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {(onLeave !== null || travelling !== null) && (
          <div className="flex flex-col gap-2 border-t pt-4">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Away today</p>
            {onLeave !== null && (
              <Link href="/leave" className="flex items-center gap-2.5 rounded-md text-sm hover:text-primary">
                <Palmtree className="size-4 text-muted-foreground" aria-hidden="true" />
                <span className="flex-1">On approved leave</span>
                <span className="font-medium tabular-nums">{onLeave}</span>
              </Link>
            )}
            {travelling !== null && (
              <Link href="/travel-orders" className="flex items-center gap-2.5 rounded-md text-sm hover:text-primary">
                <Plane className="size-4 text-muted-foreground" aria-hidden="true" />
                <span className="flex-1">On official travel</span>
                <span className="font-medium tabular-nums">{travelling}</span>
              </Link>
            )}
          </div>
        )}

        {!attendance && onLeave === null && travelling === null && (
          <p className="text-sm text-muted-foreground">Nothing to show for today with your current access.</p>
        )}
      </CardContent>
    </Card>
  );
}
