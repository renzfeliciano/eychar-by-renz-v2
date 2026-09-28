import { EmptyState } from "@/components/shared/empty-state";

type UpcomingEvent = { id: string; title: string; date: Date; time?: string | null; category: string };

export function UpcomingEventsList({ events }: { events: UpcomingEvent[] }) {
  if (events.length === 0) return <EmptyState title="Nothing scheduled" description="Company events added to the calendar will show up here." />;

  return (
    <ul className="flex flex-col gap-3">
      {events.map((event) => (
        <li key={event.id} className="flex items-center gap-3">
          <span className="flex w-10 shrink-0 flex-col items-center rounded-lg border bg-muted/40 py-1 leading-none" aria-hidden="true">
            <span className="text-[10px] font-medium text-muted-foreground uppercase">
              {event.date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}
            </span>
            <span className="text-base font-semibold tabular-nums">{event.date.toLocaleDateString("en-US", { day: "numeric", timeZone: "UTC" })}</span>
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium">{event.title}</span>
            <span className="truncate text-xs text-muted-foreground">
              {event.date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}
              {event.time ? ` · ${event.time}` : ""} · {event.category}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
