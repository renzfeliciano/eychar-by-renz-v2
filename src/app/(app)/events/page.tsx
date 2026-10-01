import type { Metadata } from "next";
import { CalendarClock, CalendarDays, CalendarRange } from "lucide-react";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { EventService } from "@/domains/events/event-service";
import { EventCategoryService } from "@/domains/catalog/event-category-service";
import { shiftMonth } from "@/domains/events/calendar";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { addDays, formatDateKey, localDateKey } from "@/lib/date-key";
import { EventsCalendar } from "./events-calendar";

export const metadata: Metadata = { title: "Company calendar" };

type SearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function EventsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("events.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view events.</p>;
  }

  const todayKey = localDateKey();
  const thisMonth = todayKey.slice(0, 7);
  const requested = firstValue(params.month);
  const month = requested && /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) ? requested : thisMonth;

  const canManage = await hasPermission("events.create", organizationId);
  // The viewed month for the grid, plus this month and next for "what's next"
  // (which shouldn't change as someone browses other months).
  const [events, currentEvents, nextEvents, categories] = await Promise.all([
    EventService.listForMonth(organizationId, month),
    month === thisMonth ? null : EventService.listForMonth(organizationId, thisMonth),
    EventService.listForMonth(organizationId, shiftMonth(thisMonth, 1)),
    EventCategoryService.listCurrent(organizationId),
  ]);

  const categoryOptions = categories.map((category) => ({ id: category.code, label: category.name }));
  const categoryNameByCode = new Map(categories.map((category) => [category.code, category.name]));

  const toItem = (event: (typeof events)[number]) => ({
    id: event._id.toString(),
    title: event.title,
    date: new Date(event.date).toISOString().slice(0, 10),
    time: event.time,
    category: event.category,
    description: event.description,
  });
  const eventsForCalendar = events.map(toItem);

  const ahead = [...(currentEvents ?? events), ...nextEvents]
    .map(toItem)
    .filter((event) => event.date >= todayKey)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "99:99").localeCompare(b.time ?? "99:99"));
  const nextSevenDays = ahead.filter((event) => event.date <= addDays(todayKey, 6)).length;
  const nextEvent = ahead[0];
  const monthLabel = formatDateKey(`${month}-01`, { month: "long" });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Company calendar" description="Meetings, holidays and deadlines for everyone. Pick a day to see or add its events." />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricCard
          label="Next event"
          value={nextEvent ? nextEvent.title : "None"}
          hint={
            nextEvent
              ? `${nextEvent.date === todayKey ? "Today" : formatDateKey(nextEvent.date, { weekday: "short", month: "short", day: "numeric" })}${nextEvent.time ? ` at ${nextEvent.time}` : ""}`
              : "No upcoming events this month or next"
          }
          icon={CalendarClock}
          emphasis={Boolean(nextEvent)}
        />
        <MetricCard label="Next 7 days" value={nextSevenDays} hint={nextSevenDays === 1 ? "event this week" : "events this week"} icon={CalendarDays} />
        <MetricCard label={`In ${monthLabel}`} value={eventsForCalendar.length} hint={`${categoryOptions.length} categories`} icon={CalendarRange} />
      </div>

      <EventsCalendar
        organizationId={organizationId}
        month={month}
        todayKey={todayKey}
        events={eventsForCalendar}
        categories={categoryOptions}
        categoryNameByCode={categoryNameByCode}
        canManage={canManage}
      />
    </div>
  );
}
