import type { Metadata } from "next";
import { CalendarClock, CircleAlert, Sun, Users } from "lucide-react";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { CompensationService } from "@/domains/payroll/compensation-service";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { ProjectService } from "@/domains/organization/project-service";
import { loadCurrentStaffCheck } from "@/domains/attendance/current-staff";
import { projectsAsOf } from "@/domains/payroll/payroll-scope";
import { formatPeso } from "@/domains/payroll/payroll-labels";
import { formatPersonName } from "@/lib/person-name";
import { dateToDateKey, formatDateKey, localDateKey } from "@/lib/date-key";
import { parseTableQuery, applyTableQuery, buildTableHref } from "@/lib/table-query";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { MetricCard } from "@/components/shared/metric-card";
import { TableSearchInput } from "@/components/shared/table-search-input";
import { CompensationFormDialog, type CompensationTerms } from "./compensation-form-dialog";
import { BulkChangeDialog } from "./bulk-change-dialog";
import { NoAccessState } from "@/components/shared/no-access-state";

export const metadata: Metadata = { title: "Compensation" };

type SearchParams = Record<string, string | string[] | undefined>;
type Allowance = { name: string; amount: number; basis: "monthly" | "daily"; taxable: boolean };

export default async function CompensationPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { organization } = await getCurrentOrganization();
  if (!organization) return <NoAccessState needed="A role in an organization" message="Your account isn't part of an organization yet." />;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("compensation.read", organizationId))) {
    return <NoAccessState permission="compensation.read" message="You don't have access to view compensation." />;
  }

  const today = localDateKey();
  const [canCreate, canUpdate, roster, isCurrentStaff, termsList, projects] = await Promise.all([
    hasPermission("compensation.create", organizationId),
    hasPermission("compensation.update", organizationId),
    EmployeeService.listWithCurrentStatus(organizationId),
    loadCurrentStaffCheck(organizationId),
    CompensationService.listForOrganization(organizationId, today),
    ProjectService.listCurrent(organizationId),
  ]);
  const termsByEmployee = new Map(termsList.map((entry) => [entry.employeeId, entry]));
  // Current staff, plus anyone who still has pay terms on file.
  const employees = roster.filter((row) => isCurrentStaff(row.currentEmployment?.status) || termsByEmployee.has(row._id.toString()));
  const projectByEmployee = await projectsAsOf(employees.map((row) => row._id.toString()), today);
  const projectNameById = new Map(projects.map((project) => [project._id.toString(), project.name]));

  const rows = employees.map((employee) => {
    const employeeId = employee._id.toString();
    const entry = termsByEmployee.get(employeeId);
    const projectId = projectByEmployee.get(employeeId);
    return {
      _id: employeeId,
      employeeId,
      name: formatPersonName(employee.person),
      employeeNumber: employee.employeeNumber,
      projectName: projectId ? (projectNameById.get(projectId) ?? null) : null,
      current: entry?.current ?? null,
      upcoming: entry?.upcoming ?? null,
    };
  });

  const withTerms = rows.filter((row) => row.current);
  const tableQuery = parseTableQuery(params, "name");
  const { rows: pageRows, total } = applyTableQuery(rows, tableQuery, {
    searchFields: (row) => [row.name, row.employeeNumber, row.projectName],
    sortValues: {
      name: (row) => row.name,
      project: (row) => row.projectName ?? "",
      rate: (row) => row.current?.rate ?? -1,
    },
  });
  const projectOptions = projects.filter((project) => project.status === "active").map((project) => ({ id: project._id.toString(), label: project.name }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Compensation"
        description="Each employee's pay terms: monthly salary or daily rate, allowances and tax status. Changes are dated, so past payroll never shifts."
        action={canUpdate ? <BulkChangeDialog organizationId={organizationId} projects={projectOptions} /> : undefined}
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="With pay terms" value={`${withTerms.length} / ${rows.length}`} hint="Current employees" icon={Users} />
        <MetricCard
          label="Monthly · daily"
          value={`${withTerms.filter((row) => row.current!.rateType === "monthly").length} · ${withTerms.filter((row) => row.current!.rateType === "daily").length}`}
          hint="By pay basis"
          icon={Sun}
        />
        <MetricCard label="Scheduled changes" value={rows.filter((row) => row.upcoming).length} hint="Dated after today" icon={CalendarClock} />
        <MetricCard
          label="Missing pay terms"
          value={rows.length - withTerms.length}
          hint={rows.length - withTerms.length ? "Left out of payroll until set" : "Everyone is set"}
          icon={CircleAlert}
          tone={rows.length - withTerms.length > 0 ? "warning" : "success"}
        />
      </div>

      <div className="flex flex-col gap-3">
        <TableSearchInput placeholder="Find by name, employee # or project" />
        <DataTable
          caption="Compensation"
          sort={{
            sortBy: tableQuery.sort,
            sortDir: tableQuery.dir,
            buildHref: (sortKey) => buildTableHref("/payroll/compensation", params, { sort: sortKey, dir: tableQuery.sort === sortKey && tableQuery.dir === "asc" ? "desc" : "asc", page: undefined }),
          }}
          pagination={{ page: tableQuery.page, pageSize: tableQuery.pageSize, total, buildHref: (page, pageSize) => buildTableHref("/payroll/compensation", params, { page, pageSize }) }}
          columns={[
            {
              key: "name",
              header: "Employee",
              sortKey: "name",
              render: (row) => (
                <div className="flex flex-col">
                  <span className="font-medium">{row.name}</span>
                  <span className="text-xs text-muted-foreground">{row.employeeNumber}</span>
                </div>
              ),
            },
            { key: "project", header: "Project", sortKey: "project", render: (row) => row.projectName ?? <span className="text-muted-foreground">—</span> },
            {
              key: "rate",
              header: "Rate",
              sortKey: "rate",
              className: "text-right",
              render: (row) =>
                row.current ? (
                  <div className="flex flex-col items-end">
                    <span className="font-medium tabular-nums">{formatPeso(row.current.rate)}</span>
                    <span className="text-xs text-muted-foreground">{row.current.rateType === "daily" ? "per day" : "per month"}</span>
                  </div>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">Not set</span>
                ),
            },
            {
              key: "allowances",
              header: "Allowances", mobile: "hidden",
              render: (row) => {
                const allowances = (row.current?.allowances ?? []) as Allowance[];
                if (allowances.length === 0) return <span className="text-muted-foreground">—</span>;
                return (
                  <div className="flex flex-col text-xs">
                    {allowances.map((allowance) => (
                      <span key={allowance.name}>
                        {allowance.name} <span className="text-muted-foreground tabular-nums">{formatPeso(allowance.amount)}/{allowance.basis === "daily" ? "day" : "mo"}</span>
                      </span>
                    ))}
                  </div>
                );
              },
            },
            {
              key: "tax",
              header: "Tax", mobile: "hidden",
              render: (row) => (row.current ? (row.current.minimumWageEarner ? <span className="text-xs">Minimum wage (exempt)</span> : <span className="text-xs text-muted-foreground">Withholding</span>) : null),
            },
            {
              key: "since",
              header: "Effective",
              render: (row) =>
                row.current ? (
                  <div className="flex flex-col text-xs">
                    <span>Since {formatDateKey(dateToDateKey(row.current.effectiveFrom))}</span>
                    {row.upcoming && (
                      <span className="font-medium text-primary">
                        {formatPeso(row.upcoming.rate)} from {formatDateKey(dateToDateKey(row.upcoming.effectiveFrom), { month: "short", day: "numeric" })}
                      </span>
                    )}
                  </div>
                ) : null,
            },
            {
              key: "action",
              header: "",
              className: "text-right",
              render: (row) => {
                if (row.current && canUpdate && !row.upcoming) {
                  const current: CompensationTerms = {
                    rateType: row.current.rateType as "monthly" | "daily",
                    rate: row.current.rate,
                    allowances: (row.current.allowances as Allowance[]).map((allowance) => ({ name: allowance.name, amount: allowance.amount, basis: allowance.basis, taxable: allowance.taxable })),
                    minimumWageEarner: row.current.minimumWageEarner,
                  };
                  return <CompensationFormDialog organizationId={organizationId} employeeId={row.employeeId} employeeName={row.name} current={current} />;
                }
                if (!row.current && !row.upcoming && canCreate) return <CompensationFormDialog organizationId={organizationId} employeeId={row.employeeId} employeeName={row.name} />;
                return null;
              },
            },
          ]}
          rows={pageRows}
          getRowKey={(row) => row.employeeId}
          emptyMessage="No employees yet."
        />
      </div>
    </div>
  );
}
