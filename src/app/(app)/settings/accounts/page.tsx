import type { Metadata } from "next";
import { KeyRound, Lock, ShieldCheck, Users } from "lucide-react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth/options";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { AccountSecurityService, type AccountSummary } from "@/domains/identity/account-security-service";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { StatusFilterTabs } from "@/components/shared/status-filter-tabs";
import { TableSearchInput } from "@/components/shared/table-search-input";
import { parseTableQuery, applyTableQuery, buildTableHref } from "@/lib/table-query";
import { formatRelativeDays } from "@/lib/relative-time";
import { RoleService } from "@/domains/authorization/role-service";
import { AccountActions } from "./account-actions";

export const metadata: Metadata = { title: "Accounts" };

type SearchParams = Record<string, string | string[] | undefined>;

const VIEWS: { value: string; label: string; match: (account: AccountSummary) => boolean }[] = [
  { value: "all", label: "All", match: () => true },
  { value: "staff", label: "HR & staff", match: (account) => account.kind === "staff" },
  { value: "self-service", label: "Employee self-service", match: (account) => account.kind === "self-service" },
  { value: "no-mfa", label: "Without two-step", match: (account) => account.status === "active" && !account.mfaEnabled },
  { value: "locked", label: "Locked", match: (account) => account.locked },
  { value: "disabled", label: "Disabled", match: (account) => account.status === "disabled" },
];

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function accountState(account: AccountSummary) {
  if (account.status === "disabled") return <StatusBadge status="disabled" label="Disabled" tone="neutral" />;
  if (account.locked) return <StatusBadge status="locked" label="Locked" tone="danger" />;
  if (account.mustChangePassword) return <StatusBadge status="temporary" label="Temporary password" tone="warning" />;
  return <StatusBadge status="active" label="Active" tone="success" />;
}

export default async function AccountsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("users.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view accounts.</p>;
  }
  const [canUpdate, session] = await Promise.all([hasPermission("users.update", organizationId), getServerSession(authOptions)]);

  const now = new Date();
  const accounts = await AccountSecurityService.listForOrganization(organizationId, now);
  // The Super Administrator's own account is theirs alone to manage.
  const superAdminIds = new Set(accounts.filter((account) => account.isSuperAdmin).map((account) => account.id));
  const totalPermissions = (await RoleService.listAvailablePermissions()).length;
  const active = accounts.filter((account) => account.status === "active");
  const staffActive = active.filter((account) => account.kind === "staff");
  const staffWithMfa = staffActive.filter((account) => account.mfaEnabled).length;
  const locked = accounts.filter((account) => account.locked).length;
  const temporary = active.filter((account) => account.mustChangePassword).length;

  const requested = typeof params.view === "string" ? params.view : "all";
  const view = VIEWS.find((option) => option.value === requested) ?? VIEWS[0];
  const tableQuery = parseTableQuery(params, "name");
  const { rows, total } = applyTableQuery(accounts.filter(view.match), tableQuery, {
    searchFields: (account) => [account.displayName, account.username, account.email, ...account.roleNames],
    sortValues: {
      name: (account) => account.displayName,
      lastSignIn: (account) => account.lastSignInAt,
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Accounts" description="Everyone who can sign in, and the state of their sign-in security. Reset a password, unlock, or disable an account." />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="Active accounts" value={active.length} hint={`${staffActive.length} HR & staff · ${active.length - staffActive.length} self-service`} icon={Users} emphasis />
        <MetricCard
          label="HR with two-step"
          value={staffActive.length ? `${staffWithMfa} of ${staffActive.length}` : "—"}
          hint={staffWithMfa < staffActive.length ? "Ask the rest to turn it on under Security" : "Every HR account is protected"}
          icon={ShieldCheck}
          tone={staffWithMfa < staffActive.length ? "warning" : "success"}
        />
        <MetricCard label="Locked now" value={locked} hint={locked ? "After repeated failed sign-ins" : "No locked accounts"} icon={Lock} tone={locked ? "danger" : "default"} />
        <MetricCard label="Temporary passwords" value={temporary} hint="Must choose their own at next sign-in" icon={KeyRound} tone={temporary ? "warning" : "default"} />
      </div>

      <div className="flex flex-col gap-3">
        <StatusFilterTabs basePath="/settings/accounts" params={params} active={view.value} paramName="view" options={VIEWS.map((option) => ({ value: option.value, label: option.label, count: accounts.filter(option.match).length }))} />
        <TableSearchInput placeholder="Search by name, username or role…" />
      </div>

      <DataTable
        caption="Accounts"
        sort={{
          sortBy: tableQuery.sort,
          sortDir: tableQuery.dir,
          buildHref: (sortKey) => buildTableHref("/settings/accounts", params, { sort: sortKey, dir: tableQuery.sort === sortKey && tableQuery.dir === "asc" ? "desc" : "asc", page: undefined }),
        }}
        pagination={{ page: tableQuery.page, pageSize: tableQuery.pageSize, total, buildHref: (page, pageSize) => buildTableHref("/settings/accounts", params, { page, pageSize }) }}
        columns={[
          {
            key: "name",
            header: "Account",
            sortKey: "name",
            render: (account) => (
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary" aria-hidden="true">
                  {initials(account.displayName)}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{account.displayName}</span>
                  <span className="truncate text-xs text-muted-foreground">@{account.username ?? account.email}</span>
                </span>
              </div>
            ),
          },
          {
            key: "kind",
            header: "Access",
            render: (account) => (
              <div className="flex flex-col gap-1">
                {superAdminIds.has(account.id) ? (
                  <>
                    <span className="text-sm font-medium text-primary">Super Administrator</span>
                    <span className="text-xs text-muted-foreground">Full access, including delete</span>
                  </>
                ) : account.kind === "self-service" ? (
                  <>
                    <span className="text-sm">Employee self-service</span>
                    <span className="text-xs text-muted-foreground">Clock-in portal only</span>
                  </>
                ) : (
                  <>
                    <span className="text-sm">{account.roleNames.length ? account.roleNames.join(", ") : "No role yet"}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {account.roleNames.length ? `Staff login · ${account.permissionCount} of ${totalPermissions} permissions` : "Staff login · can't open anything until a role is assigned"}
                    </span>
                  </>
                )}
              </div>
            ),
          },
          {
            key: "mfa",
            header: "Two-step",
            render: (account) => <StatusBadge status={account.mfaEnabled ? "on" : "off"} label={account.mfaEnabled ? "On" : "Off"} tone={account.mfaEnabled ? "success" : account.kind === "staff" ? "warning" : "neutral"} />,
          },
          { key: "state", header: "Status", render: accountState },
          {
            key: "lastSignIn",
            header: "Last sign-in",
            sortKey: "lastSignIn",
            render: (account) => <span className="whitespace-nowrap text-muted-foreground">{account.lastSignInAt ? formatRelativeDays(account.lastSignInAt, now) : "Never"}</span>,
          },
          {
            key: "actions",
            header: "",
            render: (account) =>
              canUpdate && (!superAdminIds.has(account.id) || account.id === session?.user?.id) ? (
                <AccountActions
                  organizationId={organizationId}
                  account={{
                    id: account.id,
                    displayName: account.displayName,
                    firstName: account.firstName,
                    lastName: account.lastName,
                    kind: account.kind,
                    status: account.status,
                    locked: account.locked,
                    mfaEnabled: account.mfaEnabled,
                  }}
                  isSelf={account.id === session?.user?.id}
                />
              ) : null,
          },
        ]}
        rows={rows}
        getRowKey={(account) => account.id}
        emptyMessage={tableQuery.q || view.value !== "all" ? "No accounts match this view." : "No accounts yet."}
        emptyDescription={tableQuery.q || view.value !== "all" ? "Try another tab or search." : "Create staff logins under Roles & access, and employee logins from an employee's profile."}
      />
    </div>
  );
}
