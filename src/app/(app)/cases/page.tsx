import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { CaseService } from "@/domains/cases/case-service";
import { CaseClassificationService } from "@/domains/catalog/case-classification-service";
import { CaseStatusService } from "@/domains/catalog/case-status-service";
import { ProjectService } from "@/domains/organization/project-service";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { TableSearchInput } from "@/components/shared/table-search-input";
import { parseTableQuery, applyTableQuery, buildTableHref } from "@/lib/table-query";
import { CaseFormDialog } from "./case-form-dialog";
import { CaseExportActions, type CaseExportRow } from "./case-export-actions";
import { CasePrintReport } from "./case-print-report";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function CasesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("cases.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view cases.</p>;
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

  const tableQuery = parseTableQuery(params, "caseName");
  const { rows: pageRows, total } = applyTableQuery(cases, tableQuery, {
    searchFields: (item) => [item.caseName, item.caseNumber, item.legalCounsel, projectNameById.get(item.projectId.toString())],
    sortValues: {
      project: (item) => projectNameById.get(item.projectId.toString()) ?? "",
      caseName: (item) => item.caseName,
      caseNumber: (item) => item.caseNumber,
      classification: (item) => classificationNameByCode.get(item.classification) ?? item.classification,
      status: (item) => statusNameByCode.get(item.status) ?? item.status,
    },
  });

  return (
    <>
      <div className="flex flex-col gap-6 print:hidden">
        <PageHeader
          title="Case monitoring"
          description="Track a legal, labor, or regulatory case against the company."
          action={
            <div className="flex items-center gap-2">
              <CaseExportActions rows={exportRows} />
              {canCreate && (
                <CaseFormDialog organizationId={organizationId} projects={projectOptions} classifications={classificationOptions} statuses={statusOptions} />
              )}
            </div>
          }
        />
        <TableSearchInput placeholder="Search by case name, number, or counsel…" />
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
            { key: "project", header: "Project", sortKey: "project", render: (item) => projectNameById.get(item.projectId.toString()) ?? "—" },
            { key: "caseName", header: "Case name", sortKey: "caseName", render: (item) => <span className="font-medium">{item.caseName}</span> },
            { key: "caseNumber", header: "Case number", sortKey: "caseNumber", render: (item) => item.caseNumber },
            {
              key: "classification",
              header: "Classification",
              sortKey: "classification",
              render: (item) => classificationNameByCode.get(item.classification) ?? item.classification,
            },
            { key: "status", header: "Status", sortKey: "status", render: (item) => <StatusBadge status={item.status} /> },
            { key: "legalCounsel", header: "Legal counsel", render: (item) => item.legalCounsel || "—" },
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
          ]}
          rows={pageRows}
          getRowKey={(item) => item._id.toString()}
          emptyMessage={tableQuery.q ? "No cases match this search." : "No cases recorded yet."}
        />
      </div>
      <CasePrintReport rows={exportRows} />
    </>
  );
}
