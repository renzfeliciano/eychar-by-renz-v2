import type { Metadata } from "next";
import { Ban, CalendarClock, CalendarDays, Plane } from "lucide-react";
import { HideToggle } from "@/components/shared/hide-toggle";
import { DeleteRecordButton } from "@/components/shared/delete-record-button";
import { isSuperAdmin } from "@/app/_shared/is-super-admin";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { TravelOrderService } from "@/domains/travel-orders/travel-order-service";
import { travelTiming, type TravelTiming } from "@/domains/travel-orders/travel-timing";
import { dateToDateKey, formatCalendarDate, localDateKey } from "@/lib/date-key";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { formatPersonName } from "@/lib/person-name";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { TableSearchInput } from "@/components/shared/table-search-input";
import { MetricCard } from "@/components/shared/metric-card";
import { StatusFilterTabs } from "@/components/shared/status-filter-tabs";
import { parseTableQuery, applyTableQuery, buildTableHref } from "@/lib/table-query";
import { TravelOrderFormDialog } from "./travel-order-form-dialog";
import { CancelTravelOrderButton } from "./cancel-travel-order-button";
import { TravelOrderExportActions, type TravelOrderExportRow } from "./travel-order-export-actions";
import { TravelOrderPrintReport } from "./travel-order-print-report";
import { TravelTimeline } from "./travel-timeline";
import { NoAccessState } from "@/components/shared/no-access-state";

/** "10/1/2026": travel dates are calendar days (UTC midnight). */
const NUMERIC_DATE = { year: "numeric", month: "numeric", day: "numeric" } as const;

export const metadata: Metadata = { title: "Travel orders" };

type SearchParams = Record<string, string | string[] | undefined>;

export default async function TravelOrdersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { organization } = await getCurrentOrganization();
  if (!organization) return <NoAccessState needed="A role in an organization" message="Your account isn't part of an organization yet." />;

  const organizationId = organization._id.toString();
  const superAdmin = await isSuperAdmin(organizationId);
  if (!(await hasPermission("travel-orders.read", organizationId))) {
    return <NoAccessState permission="travel-orders.read" message="You don't have access to view travel orders." />;
  }

  const [canCreate, canUpdate] = await Promise.all([
    hasPermission("travel-orders.create", organizationId),
    hasPermission("travel-orders.update", organizationId),
  ]);

  const [travelOrders, roster] = await Promise.all([
    TravelOrderService.listCurrent(organizationId),
    EmployeeService.listWithCurrentStatus(organizationId),
  ]);

  const employeeOptions = roster
    .filter((row) => row.person)
    .map((row) => ({ id: row._id.toString(), label: formatPersonName(row.person) }));
  const employeeNameById = new Map(employeeOptions.map((option) => [option.id, option.label]));

  const exportRows: TravelOrderExportRow[] = travelOrders.map((order) => ({
    employees: order.employeeIds.map((id: { toString(): string }) => employeeNameById.get(id.toString()) ?? "—").join("; "),
    startDate: formatCalendarDate(order.startDate, NUMERIC_DATE),
    endDate: formatCalendarDate(order.endDate, NUMERIC_DATE),
    remarks: order.remarks ?? "",
    status: order.status,
  }));

  // Where each order stands today, from its dates (the stored status only
  // records scheduled vs. cancelled).
  const todayKey = localDateKey();
  const timingOf = (order: (typeof travelOrders)[number]) => travelTiming(order, todayKey);
  const TIMING_LABELS: Record<TravelTiming, string> = { scheduled: "Upcoming", ongoing: "Ongoing", completed: "Completed", cancelled: "Cancelled" };
  const TIMING_TONES: Record<TravelTiming, "info" | "warning" | "success" | "neutral"> = { scheduled: "info", ongoing: "warning", completed: "success", cancelled: "neutral" };
  const timingCount = (timing: TravelTiming) => travelOrders.filter((order) => timingOf(order) === timing).length;
  const timingOptions = [
    { value: "all", label: "All", count: travelOrders.length },
    { value: "ongoing", label: "Ongoing", count: timingCount("ongoing") },
    { value: "scheduled", label: "Upcoming", count: timingCount("scheduled") },
    { value: "completed", label: "Completed", count: timingCount("completed") },
    { value: "cancelled", label: "Cancelled", count: timingCount("cancelled") },
  ];
  const requestedTiming = typeof params.timing === "string" ? params.timing : "all";
  const timingView = timingOptions.some((option) => option.value === requestedTiming) ? requestedTiming : "all";
  const visibleOrders = timingView === "all" ? travelOrders : travelOrders.filter((order) => timingOf(order) === timingView);

  const tableQuery = parseTableQuery(params, "startDate");
  const { rows: pageRows, total } = applyTableQuery(visibleOrders, tableQuery, {
    searchFields: (order) => [
      ...order.employeeIds.map((id: { toString(): string }) => employeeNameById.get(id.toString())),
      order.remarks,
    ],
    sortValues: {
      startDate: (order) => new Date(order.startDate),
      status: (order) => order.status,
    },
  });

  const live = travelOrders.filter((order) => order.status !== "cancelled");
  const ongoing = live.filter((order) => timingOf(order) === "ongoing");
  const travellingToday = new Set(ongoing.flatMap((order) => order.employeeIds.map((id: { toString(): string }) => id.toString()))).size;
  const upcoming = live.filter((order) => timingOf(order) === "scheduled").length;
  const monthKey = todayKey.slice(0, 7);
  const thisMonth = live.filter((order) => dateToDateKey(new Date(order.startDate)).slice(0, 7) <= monthKey && dateToDateKey(new Date(order.endDate)).slice(0, 7) >= monthKey).length;
  const timelineOrders = live.map((order) => ({
    id: order._id.toString(),
    names: order.employeeIds.map((id: { toString(): string }) => employeeNameById.get(id.toString()) ?? "Unknown employee"),
    startDate: new Date(order.startDate),
    endDate: new Date(order.endDate),
    status: order.status,
    remarks: order.remarks,
  }));
  const createAction = canCreate ? <TravelOrderFormDialog organizationId={organizationId} employees={employeeOptions} /> : undefined;

  return (
    <>
      <div className="flex flex-col gap-6 print:hidden">
        <PageHeader
          title="Travel orders"
          description="Dispatch one or more employees for a date range, and see who's away today."
          action={
            <div className="flex items-center gap-2">
              <TravelOrderExportActions rows={exportRows} organizationName={organization.name} />
              {canCreate && <TravelOrderFormDialog organizationId={organizationId} employees={employeeOptions} />}
            </div>
          }
        />
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <MetricCard label="Away today" value={travellingToday} hint={`${ongoing.length} ongoing order${ongoing.length === 1 ? "" : "s"}`} icon={Plane} emphasis />
          <MetricCard label="Upcoming" value={upcoming} hint="Starting after today" icon={CalendarClock} />
          <MetricCard label="This month" value={thisMonth} hint="Orders overlapping this month" icon={CalendarDays} />
          <MetricCard label="Cancelled" value={travelOrders.length - live.length} hint="Kept on record" icon={Ban} />
        </div>

        <TravelTimeline orders={timelineOrders} todayKey={todayKey} />

        <div className="flex flex-col gap-3">
          <StatusFilterTabs basePath="/travel-orders" params={params} active={timingView} options={timingOptions} paramName="timing" />
          <TableSearchInput placeholder="Search by employee or remarks…" />
        </div>
        <DataTable
          caption="Travel orders"
          sort={{
            sortBy: tableQuery.sort,
            sortDir: tableQuery.dir,
            buildHref: (sortKey) =>
              buildTableHref("/travel-orders", params, {
                sort: sortKey,
                dir: tableQuery.sort === sortKey && tableQuery.dir === "asc" ? "desc" : "asc",
                page: undefined,
              }),
          }}
          pagination={{
            page: tableQuery.page,
            pageSize: tableQuery.pageSize,
            total,
            buildHref: (page, pageSize) => buildTableHref("/travel-orders", params, { page, pageSize }),
          }}
          columns={[
            {
              key: "employees",
              header: "Employees",
              render: (order) => {
                const names: string[] = order.employeeIds.map((id: { toString(): string }) => employeeNameById.get(id.toString()) ?? "—");
                return (
                  <div className="flex items-center gap-2.5">
                    <div className="flex -space-x-2" aria-hidden="true">
                      {names.slice(0, 3).map((name, index) => (
                        <span key={`${name}-${index}`} className="flex size-7 items-center justify-center rounded-full border-2 border-card bg-primary/10 text-[10px] font-semibold text-primary">
                          {name
                            .split(" ")
                            .filter(Boolean)
                            .slice(0, 2)
                            .map((part) => part[0])
                            .join("")}
                        </span>
                      ))}
                    </div>
                    <div className="flex min-w-0 flex-col">
                      <span className="max-w-64 truncate font-medium">{names.join(", ")}</span>
                      <span className="text-xs text-muted-foreground">{names.length === 1 ? "1 employee" : `${names.length} employees`}</span>
                    </div>
                  </div>
                );
              },
            },
            {
              key: "dates",
              header: "Date range",
              sortKey: "startDate",
              render: (order) => {
                const days = Math.round((new Date(order.endDate).getTime() - new Date(order.startDate).getTime()) / 86_400_000) + 1;
                return (
                  <div className="flex flex-col">
                    <span>
                      {formatCalendarDate(order.startDate, { month: "short", day: "numeric" })} –{" "}
                      {formatCalendarDate(order.endDate)}
                    </span>
                    <span className="text-xs text-muted-foreground">{days === 1 ? "1 day" : `${days} days`}</span>
                  </div>
                );
              },
            },
            { key: "remarks", header: "Remarks", mobile: "hidden", render: (order) => <span className="line-clamp-2 max-w-64 whitespace-normal">{order.remarks || "—"}</span> },
            {
              key: "status",
              header: "Status",
              sortKey: "status",
              render: (order) => {
                const timing = timingOf(order);
                return <StatusBadge status={timing} label={TIMING_LABELS[timing]} tone={TIMING_TONES[timing]} />;
              },
            },
            {
              key: "action",
              header: "",
              render: (order) =>
                canUpdate && order.status !== "cancelled" ? (
                  <div className="flex items-center gap-1">
                    <TravelOrderFormDialog
                      organizationId={organizationId}
                      employees={employeeOptions}
                      initialValue={{
                        id: order._id.toString(),
                        employeeIds: order.employeeIds.map((id: { toString(): string }) => id.toString()),
                        startDate: order.startDate.toISOString(),
                        endDate: order.endDate.toISOString(),
                        remarks: order.remarks,
                      }}
                    />
                    <CancelTravelOrderButton id={order._id.toString()} organizationId={organizationId} />
                  </div>
                ) : null,
            },
            {
              key: "delete",
              header: "",
              className: "w-10",
              render: (row) =>
                superAdmin ? (
                <span className="flex items-center justify-end gap-0.5">
                  <HideToggle organizationId={organizationId} type="travel-order" id={row._id.toString()} label={String("Travel order")} hidden={Boolean(row.hiddenFromOthers)} />
                  <DeleteRecordButton organizationId={organizationId} type="travel-order" id={row._id.toString()} iconOnly />
                </span>
              ) : null,
            },
          ]}
          rows={pageRows}
          getRowKey={(order) => order._id.toString()}
          emptyMessage={tableQuery.q || timingView !== "all" ? "No travel orders match this view." : "No travel orders yet."}
          emptyDescription={
            tableQuery.q || timingView !== "all"
              ? "Try another tab or search."
              : "Create a travel order to dispatch one or more employees for a date range; they show as away on those days."
          }
          emptyAction={tableQuery.q || timingView !== "all" ? undefined : createAction}
        />
      </div>
      <TravelOrderPrintReport rows={exportRows} />
    </>
  );
}
