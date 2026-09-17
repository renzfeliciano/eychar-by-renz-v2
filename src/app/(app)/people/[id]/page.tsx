import { notFound } from "next/navigation";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { EmploymentService } from "@/domains/workforce/employment-service";
import { PositionService } from "@/domains/organization/position-service";
import { ProjectService } from "@/domains/organization/project-service";
import { EmployeeAccountService } from "@/domains/identity/employee-account-service";
import { AssetIssuanceService } from "@/domains/assets/asset-issuance-service";
import { NotFoundError } from "@/shared/errors";
import { formatPersonName } from "@/lib/person-name";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TransferForm } from "./transfer-form";
import { TerminateButton } from "./terminate-button";
import { CreateEmployeeAccountDialog } from "./create-employee-account-dialog";
import { AssetIssuanceFormDialog } from "./asset-issuance-form-dialog";

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("employees.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view this employee.</p>;
  }

  let detail;
  try {
    detail = await EmployeeService.getDetail(id, organizationId);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const canUpdate = await hasPermission("employees.update", organizationId);
  const isCurrentlyActive = detail.currentEmployment
    ? await EmploymentService.isActiveStatus(organizationId, detail.currentEmployment.status)
    : false;

  const [positions, projects, roster, selfServiceAccount, issuedAssets] = await Promise.all([
    PositionService.listCurrent(organizationId),
    ProjectService.listCurrent(organizationId),
    EmployeeService.listWithCurrentStatus(organizationId),
    EmployeeAccountService.getForEmployee(id),
    AssetIssuanceService.listForEmployee(id, organizationId),
  ]);
  const positionTitleById = new Map(positions.map((position) => [position._id.toString(), position.title]));
  const projectNameById = new Map(projects.map((project) => [project._id.toString(), project.name]));
  const employeeNameById = new Map(
    roster.filter((row) => row.person).map((row) => [row._id.toString(), formatPersonName(row.person)]),
  );

  const personName = detail.person ? formatPersonName(detail.person) : "Employee";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={personName} description={`Employee #${detail.employee.employeeNumber}`} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Employment</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-sm">
              <StatusBadge status={detail.currentEmployment?.status} />
              <span className="text-muted-foreground">{detail.currentEmployment?.employmentType ?? "—"}</span>
            </div>
            {canUpdate && isCurrentlyActive && (
              <TerminateButton employeeId={detail.employee._id.toString()} organizationId={organizationId} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Current assignment</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            <p>
              <span className="text-muted-foreground">Position: </span>
              {detail.currentAssignment?.positionId ? positionTitleById.get(detail.currentAssignment.positionId.toString()) ?? "—" : "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Project: </span>
              {detail.currentAssignment?.projectId ? projectNameById.get(detail.currentAssignment.projectId.toString()) ?? "—" : "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Reports to: </span>
              {detail.currentAssignment?.reportsToEmployeeId
                ? employeeNameById.get(detail.currentAssignment.reportsToEmployeeId.toString()) ?? "—"
                : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Self-service login</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          {selfServiceAccount ? (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{selfServiceAccount.username}</span> can sign in on their own device to
              clock in/out with biometric confirmation.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">No self-service login yet — this employee can&apos;t clock in/out on their own device.</p>
              {canUpdate && (
                <CreateEmployeeAccountDialog
                  organizationId={organizationId}
                  employeeId={detail.employee._id.toString()}
                  suggestedUsername={detail.employee.employeeNumber.toLowerCase()}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Issued assets</CardTitle>
          {canUpdate && <AssetIssuanceFormDialog organizationId={organizationId} employeeId={detail.employee._id.toString()} />}
        </CardHeader>
        <CardContent>
          <DataTable
            columns={[
              { key: "assetName", header: "Asset", render: (record) => <span className="font-medium">{record.assetName}</span> },
              { key: "type", header: "Type", render: (record) => record.assetType || "—" },
              { key: "serial", header: "Serial #", render: (record) => record.serialNumber || "—" },
              { key: "condition", header: "Condition", render: (record) => record.condition },
              { key: "issued", header: "Issued", render: (record) => new Date(record.issuedDate).toLocaleDateString() },
              {
                key: "returned",
                header: "Returned",
                render: (record) => (record.returnedDate ? new Date(record.returnedDate).toLocaleDateString() : "—"),
              },
              {
                key: "action",
                header: "",
                render: (record) =>
                  canUpdate ? (
                    <AssetIssuanceFormDialog
                      organizationId={organizationId}
                      employeeId={detail.employee._id.toString()}
                      initialValue={{
                        id: record._id.toString(),
                        assetName: record.assetName,
                        assetType: record.assetType,
                        serialNumber: record.serialNumber,
                        condition: record.condition,
                        issuedDate: record.issuedDate.toISOString(),
                        returnedDate: record.returnedDate?.toISOString(),
                        remarks: record.remarks,
                      }}
                    />
                  ) : null,
              },
            ]}
            rows={issuedAssets}
            getRowKey={(record) => record._id.toString()}
            emptyMessage="No assets logged yet."
          />
        </CardContent>
      </Card>

      {canUpdate && (
        <TransferForm
          employeeId={detail.employee._id.toString()}
          organizationId={organizationId}
          positions={positions.map((position) => ({ id: position._id.toString(), label: position.title }))}
          projects={projects.map((project) => ({ id: project._id.toString(), label: project.name }))}
          managers={roster
            .filter((row) => row.person && row._id.toString() !== detail.employee._id.toString())
            .map((row) => ({ id: row._id.toString(), label: formatPersonName(row.person) }))}
        />
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Assignment history</h2>
        <DataTable
          columns={[
            {
              key: "position",
              header: "Position",
              render: (assignment) => (assignment.positionId ? positionTitleById.get(assignment.positionId.toString()) ?? "—" : "—"),
            },
            {
              key: "project",
              header: "Project",
              render: (assignment) => (assignment.projectId ? projectNameById.get(assignment.projectId.toString()) ?? "—" : "—"),
            },
            {
              key: "reportsTo",
              header: "Reports to",
              render: (assignment) =>
                assignment.reportsToEmployeeId ? employeeNameById.get(assignment.reportsToEmployeeId.toString()) ?? "—" : "—",
            },
            { key: "from", header: "From", render: (assignment) => new Date(assignment.effectiveFrom).toLocaleDateString() },
            {
              key: "to",
              header: "To",
              render: (assignment) => (assignment.effectiveTo ? new Date(assignment.effectiveTo).toLocaleDateString() : "Current"),
            },
          ]}
          rows={detail.assignmentHistory}
          getRowKey={(assignment) => assignment._id.toString()}
          emptyMessage="No assignment history yet."
        />
      </div>
    </div>
  );
}
