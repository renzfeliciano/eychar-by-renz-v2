import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { EventService } from "@/domains/events/event-service";
import { EventCategoryService } from "@/domains/catalog/event-category-service";
import { PageHeader } from "@/components/shared/page-header";
import { MonthNav } from "./month-nav";
import { EventsCalendar } from "./events-calendar";

type SearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default async function EventsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("events.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view events.</p>;
  }

  const canManage = await hasPermission("events.create", organizationId);
  const month = firstValue(params.month) ?? currentMonth();

  const [events, categories] = await Promise.all([
    EventService.listForMonth(organizationId, month),
    EventCategoryService.listCurrent(organizationId),
  ]);

  const categoryOptions = categories.map((category) => ({ id: category.code, label: category.name }));
  const categoryNameByCode = new Map(categories.map((category) => [category.code, category.name]));

  const eventsForCalendar = events.map((event) => ({
    id: event._id.toString(),
    title: event.title,
    date: event.date.toISOString().slice(0, 10),
    time: event.time,
    category: event.category,
    description: event.description,
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Events"
        description="Company-wide meetings, holidays, and deadlines, at a glance."
        action={<MonthNav month={month} />}
      />
      <EventsCalendar
        organizationId={organizationId}
        month={month}
        events={eventsForCalendar}
        categories={categoryOptions}
        categoryNameByCode={categoryNameByCode}
        canManage={canManage}
      />
    </div>
  );
}
