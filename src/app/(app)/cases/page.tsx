import type { Metadata } from "next";

import { HideToggle } from "@/components/shared/hide-toggle";
import { DeleteRecordButton } from "@/components/shared/delete-record-button";
import { isSuperAdmin } from "@/app/_shared/is-super-admin";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { CaseService } from "@/domains/cases/case-service";
import { closedCaseCodes, filterCasesByView, isStaleCase, summarizeCases, CASE_STALE_DAYS } from "@/domains/cases/case-summary";
import { CaseClassificationService } from "@/domains/catalog/case-classification-service";
import { CaseStatusService } from "@/domains/catalog/case-status-service";
import { ProjectService } from "@/domains/organization/project-service";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { TableSearchInput } from "@/components/shared/table-search-input";
import { MetricCard, MetricStrip } from "@/components/shared/metric-card";
import { StatusFilterTabs } from "@/components/shared/status-filter-tabs";
import { HorizontalBarChart } from "@/components/shared/horizontal-bar-chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelativeDays } from "@/lib/relative-time";
import { cn } from "@/lib/utils";
import { parseTableQuery, applyTableQuery, buildTableHref } from "@/lib/table-query";
import { CaseFormDialog } from "./case-form-dialog";
import { CaseExportActions, type CaseExportRow } from "./case-export-actions";
import { CasePrintReport } from "./case-print-report";
import { CaseDetailSheet } from "./case-detail-sheet";
import { NoAccessState } from "@/components/shared/no-access-state";

export const metadata: Metadata = { title: "Case monitoring" };

type SearchParams = Record<string, string | string[] | undefined>;

export default async function CasesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { organization } = await getCurrentOrganization();
  if (!organization) return <NoAccessState needed="A role in an organization" message="Your account isn't part of an organization yet." />;

  const organizationId = organization._id.toString();
  const superAdmin = await isSuperAdmin(organizationId);
  if (!(await hasPermission("cases.read", organizationId))) {
    return <NoAccessState permission="cases.read" message="You don't have access to view cases." />;
  }

  const [canCreate, canUpdate] = await Promise.all([
    hasPermission("cases.create", organizationId),
    hasPermission("cases.update", organizationId),
  ]);

  const [cases, classifications, statuses, projects] = await Promise.all([
    CaseService.listCurrent(organizationId),
    CaseClassificationService.listCurrent(organizationId),
    CaseStatusService.listCurrent(organizationId),
    ProjectService.listCurrent(organizationId),
  ]);

  const classificationOptions = classifications.map((item) => ({ id: item.code, label: item.name }));
  const statusOptions = statuses.map((item) => ({ id: item.code, label: item.name }));
  const projectOptions = projects.map((project) => ({ id: project._id.toString(), label: project.name }));
  const classificationNameByCode = new Map(classifications.map((item) => [item.code, item.name]));
  const statusNameByCode = new Map(statuses.map((item) => [item.code, item.name]));
  const projectNameById = new Map(projects.map((project) => [project._id.toString(), project.name]));

  const exportRows: CaseExportRow[] = cases.map((item) => ({
    caseName: item.caseName,
    caseNumber: item.caseNumber,
    project: projectNameById.get(item.projectId.toString()) ?? "—",
    classification: classificationNameByCode.get(item.classification) ?? item.classification,
    status: statusNameByCode.get(item.status) ?? item.status,
    legalCounsel: item.legalCounsel ?? "",
    briefHistory: item.briefHistory ?? "",
  }));

  // Status tabs: all, open, closed, then each status that has cases.
  const now = new Date();
  const closedCodes = closedCaseCodes(statuses);
  const summary = summarizeCases(cases, now, closedCodes);
  const statusCounts = new Map<string, number>();
  for (const item of cases) statusCounts.set(item.status, (statusCounts.get(item.status) ?? 0) + 1);
  const viewOptions = [
    { value: "all", label: "All", count: cases.length },
    { value: "open", label: "Open", count: summary.open },
    { value: "closed", label: "Closed", count: summary.closed },
    ...statuses.filter((status) => statusCounts.has(status.code)).map((status) => ({ value: status.code, label: status.name, count: statusCounts.get(status.code)! })),
  ];
  const requestedView = typeof params.status === "string" ? params.status : "all";
  const view = viewOptions.some((option) => option.value === requestedView) ? requestedView : "all";

  const tableQuery = parseTableQuery(params, "caseName");
  const { rows: pageRows, total } = applyTableQuery(filterCasesByView(cases, view, closedCodes), tableQuery, {
    searchFields: (item) => [item.caseName, item.caseNumber, item.legalCounsel, projectNameById.get(item.projectId.toString())],
    sortValues: {
      project: (item) => projectNameById.get(item.projectId.toString()) ?? "",
      caseName: (item) => item.caseName,
      caseNumber: (item) => item.caseNumber,
      classification: (item) => classificationNameByCode.get(item.classification) ?? item.classification,
      status: (item) => statusNameByCode.get(item.status) ?? item.status,
      updatedAt: (item) => (item.updatedAt ? new Date(item.updatedAt) : null),
    },
  });

  // Summary: open cases, those in mediation, those gone quiet, and how
  // widely the open ones spread across projects.
  const inMediation = cases.filter((item) => item.status === "mediation").length;
  const breakdownColor = "var(--viz-series-1)";
  const byClassification = summary.byClassification.map((row) => ({ label: classificationNameByCode.get(row.key) ?? row.key, count: row.count, color: breakdownColor }));
  const byProject = summary.byProject.map((row) => ({ label: projectNameById.get(row.key) ?? "Unknown project", count: row.count, color: breakdownColor }));
  const createAction = canCreate ? (
    <CaseFormDialog organizationId={organizationId} projects={projectOptions} classifications={classificationOptions} statuses={statusOptions} />
  ) : undefined;

  return (
    <>
      <div className="flex flex-col gap-6 print:hidden">
        <PageHeader
          title="Case monitoring"
          description="Track a legal, labor, or regulatory case against the company."
          action={
            <div className="flex items-center gap-2">
              <CaseExportActions rows={exportRows} organizationName={organization.name} />
              {canCreate && (
                <CaseFormDialog organizationId={organizationId} projects={projectOptions} classifications={classificationOptions} statuses={statusOptions} />
              )}
            </div>
          }
        />
        <MetricStrip columns={4}>
          <MetricCard label="Open cases" value={summary.open} hint={`${summary.closed} closed or dismissed`} tone={summary.open ? "warning" : "success"} />
          <MetricCard label="In mediation" value={inMediation} hint="Being settled" />
          <MetricCard
            label="Needs follow-up"
            value={summary.stale}
            hint={summary.stale ? `Open, no update in ${CASE_STALE_DAYS} days` : "Every open case is current"}
            tone={summary.stale ? "danger" : "default"}
          />
          <MetricCard label="Projects involved" value={summary.byProject.length} hint="With an open case" />
        </MetricStrip>

        {summary.open > 0 && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Open cases by classification</CardTitle>
                <CardDescription>What the open cases are about</CardDescription>
              </CardHeader>
              <CardContent>
                <HorizontalBarChart buckets={byClassification} ariaLabel="Open cases by classification" labelClassName="w-32 sm:w-44" emptyTitle="No open cases" emptyDescription="" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Open cases by project</CardTitle>
                <CardDescription>Where they come from</CardDescription>
              </CardHeader>
              <CardContent>
                <HorizontalBarChart buckets={byProject} ariaLabel="Open cases by project" labelClassName="w-32 sm:w-44" emptyTitle="No open cases" emptyDescription="" />
              </CardContent>
            </Card>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <StatusFilterTabs basePath="/cases" params={params} active={view} options={viewOptions} />
          <TableSearchInput placeholder="Search by case name, number, or counsel…" />
        </div>
        <DataTable
          caption="Cases"
          sort={{
            sortBy: tableQuery.sort,
            sortDir: tableQuery.dir,
            buildHref: (sortKey) =>
              buildTableHref("/cases", params, {
                sort: sortKey,
                dir: tableQuery.sort === sortKey && tableQuery.dir === "asc" ? "desc" : "asc",
                page: undefined,
              }),
          }}
          pagination={{
            page: tableQuery.page,
            pageSize: tableQuery.pageSize,
            total,
            buildHref: (page, pageSize) => buildTableHref("/cases", params, { page, pageSize }),
          }}
          columns={[
            {
              key: "caseName",
              header: "Case",
              sortKey: "caseName",
              render: (item) => (
                <div className="flex flex-col items-start">
                  <CaseDetailSheet
                    nowIso={now.toISOString()}
                    item={{
                      caseName: item.caseName,
                      caseNumber: item.caseNumber,
                      projectName: projectNameById.get(item.projectId.toString()) ?? "—",
                      classificationName: classificationNameByCode.get(item.classification) ?? item.classification,
                      statusCode: item.status,
                      statusName: statusNameByCode.get(item.status) ?? item.status,
                      legalCounsel: item.legalCounsel,
                      briefHistory: item.briefHistory,
                      createdAt: new Date(item.createdAt).toISOString(),
                      updatedAt: new Date(item.updatedAt).toISOString(),
                    }}
                  />
                  <span className="font-mono text-xs text-muted-foreground">{item.caseNumber}</span>
                </div>
              ),
            },
            { key: "project", header: "Project", sortKey: "project", render: (item) => projectNameById.get(item.projectId.toString()) ?? "—" },
            {
              key: "classification",
              header: "Classification", mobile: "subtitle",
              sortKey: "classification",
              render: (item) => (
                <span className="inline-flex rounded-full border px-2 py-0.5 text-xs whitespace-nowrap text-muted-foreground">
                  {classificationNameByCode.get(item.classification) ?? item.classification}
                </span>
              ),
            },
            { key: "status", header: "Status", sortKey: "status", render: (item) => <StatusBadge status={item.status} label={statusNameByCode.get(item.status)} /> },
            { key: "legalCounsel", header: "Legal counsel", mobile: "hidden", render: (item) => item.legalCounsel || <span className="text-muted-foreground">Not assigned</span> },
            {
              key: "updatedAt",
              header: "Last updated",
              sortKey: "updatedAt",
              render: (item) => {
                const stale = isStaleCase(item, now, closedCodes);
                return (
                  <span className={cn("whitespace-nowrap", stale ? "font-medium text-destructive" : "text-muted-foreground")} title={stale ? `No update in over ${CASE_STALE_DAYS} days` : undefined}>
                    {formatRelativeDays(item.updatedAt, now)}
                  </span>
                );
              },
            },
            {
              key: "action",
              header: "",
              render: (item) =>
                canUpdate ? (
                  <CaseFormDialog
                    organizationId={organizationId}
                    projects={projectOptions}
                    classifications={classificationOptions}
                    statuses={statusOptions}
                    initialCase={{
                      id: item._id.toString(),
                      projectId: item.projectId.toString(),
                      caseName: item.caseName,
                      caseNumber: item.caseNumber,
                      classification: item.classification,
                      status: item.status,
                      legalCounsel: item.legalCounsel,
                      briefHistory: item.briefHistory,
                    }}
                  />
                ) : null,
            },
            {
              key: "delete",
              header: "",
              className: "w-10",
              render: (row) =>
                superAdmin ? (
                <span className="flex items-center justify-end gap-0.5">
                  <HideToggle organizationId={organizationId} type="case" id={row._id.toString()} label={String(row.caseName)} hidden={Boolean(row.hiddenFromOthers)} />
                  <DeleteRecordButton organizationId={organizationId} type="case" id={row._id.toString()} iconOnly />
                </span>
              ) : null,
            },
          ]}
          rows={pageRows}
          getRowKey={(item) => item._id.toString()}
          emptyMessage={tableQuery.q || view !== "all" ? "No cases match this view." : "No cases recorded yet."}
          emptyDescription={
            tableQuery.q || view !== "all" ? "Try another status tab or search." : "Record legal, labor or regulatory cases against the company to track their status and counsel per project."
          }
          emptyAction={tableQuery.q || view !== "all" ? undefined : createAction}
        />
      </div>
      <CasePrintReport rows={exportRows} />
    </>
  );
}
