import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth/options";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { SuperAdminService } from "@/domains/authorization/super-admin-service";
import { DeletionService, RECYCLE_BIN_DAYS } from "@/domains/deletion/deletion-service";
import { DELETABLE_TYPES, isDeletableType } from "@/domains/deletion/deletion-registry";
import { userDisplayNames } from "@/domains/identity/user-directory";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { cn } from "@/lib/utils";
import { BinActions } from "./bin-actions";

export const metadata: Metadata = { title: "Recycle bin" };

const WHEN = { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" } as const;
const DAY_MS = 86_400_000;

/** Whole days until an entry is purged (never negative). */
function daysUntil(date: Date | string): number {
  return Math.max(0, Math.ceil((new Date(date).getTime() - Date.now()) / DAY_MS));
}

export default async function RecycleBinPage() {
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;
  const organizationId = organization._id.toString();
  const session = await getServerSession(authOptions);
  if (!(await SuperAdminService.isSuperAdmin(session?.user?.id, organizationId))) {
    return <p className="text-sm text-muted-foreground">Only the Super Administrator can see the recycle bin.</p>;
  }

  // Anything past its 30 days goes for good before the list is shown.
  await DeletionService.purgeExpired(organizationId);
  const entries = await DeletionService.listBin(organizationId);
  const names = await userDisplayNames(entries.map((entry) => entry.deletedBy));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Recycle bin"
        description={`Records you deleted, with everything that went with them. Restore puts them back exactly as they were; after ${RECYCLE_BIN_DAYS} days they're deleted for good.`}
      />
      <DataTable
        caption="Recycle bin"
        columns={[
          {
            key: "record",
            header: "Record",
            render: (entry) => (
              <div className="flex flex-col">
                <span className="font-medium">{entry.label}</span>
                <span className="text-xs text-muted-foreground capitalize">{isDeletableType(entry.entityType) ? DELETABLE_TYPES[entry.entityType].noun : entry.entityType}</span>
              </div>
            ),
          },
          {
            key: "contents",
            header: "What went with it",
            render: (entry) => (
              <span className="text-sm text-muted-foreground">
                {entry.summary.map((row) => `${row.count} ${row.label?.toLowerCase()}`).join(" · ") || "—"}
              </span>
            ),
          },
          {
            key: "deleted",
            header: "Deleted",
            render: (entry) => (
              <div className="flex flex-col text-sm">
                <span>{new Date(entry.deletedAt).toLocaleString("en-US", WHEN)}</span>
                <span className="text-xs text-muted-foreground">by {names.get(entry.deletedBy?.toString() ?? "") ?? "—"}</span>
              </div>
            ),
          },
          {
            key: "purge",
            header: "Deleted for good in",
            render: (entry) => {
              const days = daysUntil(entry.purgeAfter);
              return <span className={cn("text-sm tabular-nums", days <= 3 && "font-medium text-destructive")}>{days} day{days === 1 ? "" : "s"}</span>;
            },
          },
          { key: "action", header: "", render: (entry) => <BinActions organizationId={organizationId} batchId={entry._id.toString()} label={entry.label} /> },
        ]}
        rows={entries}
        getRowKey={(entry) => entry._id.toString()}
        emptyMessage="The recycle bin is empty."
        emptyDescription="Records you delete appear here for 30 days, so a mistake can be undone."
      />
    </div>
  );
}
