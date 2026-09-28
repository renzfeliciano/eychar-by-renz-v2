import Link from "next/link";
import { Activity, AlertTriangle, LogIn, ScrollText } from "lucide-react";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { AuditQueryService } from "@/server/audit/audit-query-service";
import { describeAuditAction, WARNING_SECURITY_EVENTS } from "@/domains/identity/security-event-labels";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { DataTable } from "@/components/shared/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button, buttonVariants } from "@/components/ui/button";
import { addDays, localDateKey } from "@/lib/date-key";
import { cn } from "@/lib/utils";
import { AuditEntrySheet } from "./audit-entry-sheet";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || undefined;
const isDateKey = (value: string | undefined) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined);
const WHEN = { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" } as const;
const PAGE_SIZE = 25;

/** Every recorded change and sign-in in the organization, newest first. Read-only: entries can't be edited or deleted. */
export default async function AuditLogPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("audit-logs.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view the audit log.</p>;
  }

  const area = first(params.area);
  const from = isDateKey(first(params.from));
  const to = isDateKey(first(params.to));
  const page = Math.max(Number(first(params.page)) || 1, 1);
  const today = localDateKey();
  const weekAgo = addDays(today, -6);

  const [result, areas, todayCount, weekSignIns, weekFailures] = await Promise.all([
    AuditQueryService.list(organizationId, { area, from, to, page, pageSize: PAGE_SIZE }),
    AuditQueryService.areas(organizationId),
    AuditQueryService.count(organizationId, { from: today, to: today }),
    AuditQueryService.count(organizationId, { actions: ["auth.signed-in"], from: weekAgo, to: today }),
    AuditQueryService.count(organizationId, { actions: ["auth.sign-in-failed", "auth.account-locked"], from: weekAgo, to: today }),
  ]);

  const pageCount = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const hrefFor = (nextPage: number) => {
    const query = new URLSearchParams();
    if (area) query.set("area", area);
    if (from) query.set("from", from);
    if (to) query.set("to", to);
    if (nextPage > 1) query.set("page", String(nextPage));
    const text = query.toString();
    return `/settings/audit${text ? `?${text}` : ""}`;
  };
  const areaLabel = (value: string) => describeAuditAction(`${value}.x`).replace(/ x$/, "").replace(/^Auth$/, "Sign-in & security");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Audit log" description="Every recorded change and sign-in in your organization, newest first. Entries can't be edited or deleted." />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="Entries today" value={todayCount} hint="Changes and sign-ins" icon={Activity} emphasis />
        <MetricCard label="Sign-ins" value={weekSignIns} hint="Last 7 days" icon={LogIn} />
        <MetricCard label="Failed sign-ins & locks" value={weekFailures} hint="Last 7 days" icon={AlertTriangle} tone={weekFailures ? "warning" : "default"} />
        <MetricCard label="Matching entries" value={result.total} hint={area || from || to ? "With the filters below" : "All time"} icon={ScrollText} />
      </div>

      {/* A plain GET form: filters live in the URL, so a filtered view can be bookmarked or shared. */}
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="audit-area">Area</Label>
          <select
            id="audit-area"
            name="area"
            defaultValue={area ?? ""}
            className="h-9 min-w-48 rounded-lg border border-input bg-background px-2.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="">All areas</option>
            {areas.map((value) => (
              <option key={value} value={value}>
                {areaLabel(value)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="audit-from">From</Label>
          <Input id="audit-from" name="from" type="date" defaultValue={from} className="w-40" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="audit-to">To</Label>
          <Input id="audit-to" name="to" type="date" defaultValue={to} className="w-40" />
        </div>
        <Button type="submit">Apply</Button>
        {(area || from || to) && (
          <Link href="/settings/audit" className={buttonVariants({ variant: "ghost" })}>
            Clear
          </Link>
        )}
      </form>

      <DataTable
        caption="Audit log entries"
        columns={[
          {
            key: "when",
            header: "When",
            render: (row) => <span className="whitespace-nowrap tabular-nums">{new Date(row.timestamp).toLocaleString("en-US", WHEN)}</span>,
          },
          { key: "who", header: "Who", render: (row) => <span className="font-medium">{row.actorName}</span> },
          {
            key: "what",
            header: "What happened",
            render: (row) => (
              <span className={cn("flex items-center gap-1.5", WARNING_SECURITY_EVENTS.has(row.action) && "text-warning")}>
                {WARNING_SECURITY_EVENTS.has(row.action) && <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />}
                {describeAuditAction(row.action)}
              </span>
            ),
          },
          { key: "record", header: "Record", render: (row) => <span className="text-muted-foreground">{row.resourceType}</span> },
          {
            key: "details",
            header: "",
            render: (row) => (
              <AuditEntrySheet
                entry={{
                  id: row.id,
                  when: new Date(row.timestamp).toLocaleString("en-US", WHEN),
                  actorName: row.actorName,
                  actionLabel: describeAuditAction(row.action),
                  action: row.action,
                  resourceType: row.resourceType,
                  resourceId: row.resourceId,
                  before: row.before,
                  after: row.after,
                  metadata: row.metadata,
                }}
              />
            ),
          },
        ]}
        rows={result.rows}
        getRowKey={(row) => row.id}
        emptyMessage={area || from || to ? "No entries match these filters." : "Nothing recorded yet."}
        emptyDescription={area || from || to ? "Widen the date range or pick another area." : "Changes and sign-ins will appear here as people use the system."}
      />

      {result.total > PAGE_SIZE && (
        <nav aria-label="Audit log pages" className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground tabular-nums">
            Page {page} of {pageCount} · {result.total} entries
          </span>
          <div className="flex gap-2">
            <Link href={hrefFor(page - 1)} aria-disabled={page <= 1} className={cn(buttonVariants({ variant: "outline", size: "sm" }), page <= 1 && "pointer-events-none opacity-50")}>
              Newer
            </Link>
            <Link href={hrefFor(page + 1)} aria-disabled={page >= pageCount} className={cn(buttonVariants({ variant: "outline", size: "sm" }), page >= pageCount && "pointer-events-none opacity-50")}>
              Older
            </Link>
          </div>
        </nav>
      )}
    </div>
  );
}
