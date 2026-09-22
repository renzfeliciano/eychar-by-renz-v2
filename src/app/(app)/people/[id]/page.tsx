import { notFound } from "next/navigation";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { EmploymentService } from "@/domains/workforce/employment-service";
import { PositionService } from "@/domains/organization/position-service";
import { ProjectService } from "@/domains/organization/project-service";
import { EmployeeAccountService } from "@/domains/identity/employee-account-service";
import { WebAuthnService } from "@/domains/identity/webauthn-service";
import { AssetIssuanceService } from "@/domains/assets/asset-issuance-service";
import { EmployeeDocumentService } from "@/domains/documents/employee-document-service";
import { DocumentTypeService } from "@/domains/catalog/document-type-service";
import { LeaveBalanceService } from "@/domains/leave/leave-balance-service";
import { LeaveTypeService } from "@/domains/leave/leave-type-service";
import { NotFoundError } from "@/shared/errors";
import { formatPersonName } from "@/lib/person-name";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TransferForm } from "./transfer-form";
import { TerminateButton } from "./terminate-button";
import { EditEmployeeDialog } from "./edit-employee-dialog";
import { CreateEmployeeAccountDialog } from "./create-employee-account-dialog";
import { ResetBiometricButton } from "./reset-biometric-button";
import { AssetIssuanceFormDialog } from "./asset-issuance-form-dialog";
import { DocumentFormDialog } from "./document-form-dialog";
import { DocumentDownloadButton } from "./document-download-button";
import { GrantLeaveBalanceDialog } from "./grant-leave-balance-dialog";
import { AdjustLeaveBalanceDialog } from "@/components/shared/adjust-leave-balance-dialog";

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

  const [positions, projects, roster, selfServiceAccount, issuedAssets, documents, documentTypes, leaveBalances, leaveTypes] = await Promise.all([
    PositionService.listCurrent(organizationId),
    ProjectService.listCurrent(organizationId),
    EmployeeService.listWithCurrentStatus(organizationId),
    EmployeeAccountService.getForEmployee(id),
    AssetIssuanceService.listForEmployee(id, organizationId),
    EmployeeDocumentService.listForEmployee(id, organizationId),
    DocumentTypeService.listCurrent(organizationId),
    LeaveBalanceService.listForEmployee(id, organizationId),
    LeaveTypeService.listCurrent(organizationId),
  ]);
  const hasBiometricCredential = selfServiceAccount ? await WebAuthnService.hasRegisteredCredential(selfServiceAccount._id.toString()) : false;
  const documentTypeOptions = documentTypes.map((item) => ({ id: item.code, label: item.name }));
  const documentTypeNameByCode = new Map(documentTypes.map((item) => [item.code, item.name]));
  const leaveTypeOptions = leaveTypes.map((leaveType) => ({ id: leaveType._id.toString(), label: leaveType.name }));
  const leaveTypeNameById = new Map(leaveTypes.map((leaveType) => [leaveType._id.toString(), leaveType.name]));
  const leaveBalancesAvailable = await Promise.all(
    leaveBalances.map((balance) =>
      LeaveBalanceService.getAvailable({
        organizationId,
        employeeId: id,
        leaveTypeId: balance.leaveTypeId.toString(),
        year: balance.year,
      }),
    ),
  );
  const availableByLeaveBalanceId = new Map(leaveBalances.map((balance, index) => [balance._id.toString(), leaveBalancesAvailable[index]]));
  const positionTitleById = new Map(positions.map((position) => [position._id.toString(), position.title]));
  const projectNameById = new Map(projects.map((project) => [project._id.toString(), project.name]));
  const employeeNameById = new Map(
    roster.filter((row) => row.person).map((row) => [row._id.toString(), formatPersonName(row.person)]),
  );

  const personName = detail.person ? formatPersonName(detail.person) : "Employee";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={personName}
        description={`Employee #${detail.employee.employeeNumber ?? "—"}`}
        action={
          canUpdate &&
          detail.person && (
            <EditEmployeeDialog
              organizationId={organizationId}
              employeeId={detail.employee._id.toString()}
              initialValue={{
                firstName: detail.person.firstName,
                middleName: detail.person.middleName,
                lastName: detail.person.lastName,
                email: detail.person.email,
                employeeNumber: detail.employee.employeeNumber,
                gender: detail.person.gender,
                birthDate: detail.person.birthDate ? new Date(detail.person.birthDate).toISOString().slice(0, 10) : undefined,
                phone: detail.person.phone,
                address: detail.person.address,
                sssNumber: detail.person.sssNumber,
                philHealthNumber: detail.person.philHealthNumber,
                pagIbigNumber: detail.person.pagIbigNumber,
                tinNumber: detail.person.tinNumber,
              }}
            />
          )
        }
      />

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
            <>
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{selfServiceAccount.username}</span> can sign in on their own device to
                clock in/out.{" "}
                {hasBiometricCredential
                  ? "Biometric verification is set up."
                  : "Biometric verification isn't set up on any device yet."}
              </p>
              {canUpdate && hasBiometricCredential && (
                <ResetBiometricButton organizationId={organizationId} userId={selfServiceAccount._id.toString()} />
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">No self-service login yet — this employee can&apos;t clock in/out on their own device.</p>
              {canUpdate && (
                <CreateEmployeeAccountDialog
                  organizationId={organizationId}
                  employeeId={detail.employee._id.toString()}
                  suggestedUsername={detail.employee.employeeNumber?.toLowerCase()}
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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Documents</CardTitle>
          {canUpdate && <DocumentFormDialog organizationId={organizationId} employeeId={detail.employee._id.toString()} documentTypes={documentTypeOptions} />}
        </CardHeader>
        <CardContent>
          <DataTable
            columns={[
              { key: "title", header: "Title", render: (document) => <span className="font-medium">{document.title}</span> },
              { key: "type", header: "Type", render: (document) => documentTypeNameByCode.get(document.documentType) ?? document.documentType },
              { key: "fileName", header: "File", render: (document) => document.fileName },
              {
                key: "expires",
                header: "Expires",
                render: (document) => (document.expiresAt ? new Date(document.expiresAt).toLocaleDateString() : "—"),
              },
              { key: "uploaded", header: "Uploaded", render: (document) => new Date(document.createdAt).toLocaleDateString() },
              {
                key: "action",
                header: "",
                render: (document) => (
                  <div className="flex items-center gap-1">
                    <DocumentDownloadButton
                      employeeId={detail.employee._id.toString()}
                      documentId={document._id.toString()}
                      organizationId={organizationId}
                      fileName={document.fileName}
                    />
                    {canUpdate && (
                      <DocumentFormDialog
                        organizationId={organizationId}
                        employeeId={detail.employee._id.toString()}
                        documentTypes={documentTypeOptions}
                        initialValue={{
                          id: document._id.toString(),
                          title: document.title,
                          documentType: document.documentType,
                          fileName: document.fileName,
                          expiresAt: document.expiresAt?.toISOString(),
                          notes: document.notes,
                        }}
                      />
                    )}
                  </div>
                ),
              },
            ]}
            rows={documents}
            getRowKey={(document) => document._id.toString()}
            emptyMessage="No documents uploaded yet."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Leave balances</CardTitle>
          {canUpdate && <GrantLeaveBalanceDialog organizationId={organizationId} employeeId={detail.employee._id.toString()} leaveTypes={leaveTypeOptions} />}
        </CardHeader>
        <CardContent>
          <DataTable
            columns={[
              {
                key: "leaveType",
                header: "Leave type",
                render: (balance) => <span className="font-medium">{leaveTypeNameById.get(balance.leaveTypeId.toString()) ?? "—"}</span>,
              },
              { key: "year", header: "Year", render: (balance) => balance.year },
              {
                key: "entitled",
                header: "Entitled",
                render: (balance) => (balance.hasNoFixedAmount ? "Unlimited" : balance.entitledDays.toFixed(2)),
              },
              { key: "adjustment", header: "Adjustment", render: (balance) => balance.adjustmentDays.toFixed(2) },
              {
                key: "available",
                header: "Available",
                render: (balance) => {
                  if (balance.hasNoFixedAmount) return "Unlimited";
                  const value = availableByLeaveBalanceId.get(balance._id.toString());
                  return value !== undefined ? value.toFixed(2) : "—";
                },
              },
              {
                key: "action",
                header: "",
                render: (balance) =>
                  canUpdate ? (
                    <AdjustLeaveBalanceDialog
                      organizationId={organizationId}
                      balanceId={balance._id.toString()}
                      leaveTypeLabel={leaveTypeNameById.get(balance.leaveTypeId.toString()) ?? "leave"}
                      currentAdjustmentDays={balance.adjustmentDays}
                    />
                  ) : null,
              },
            ]}
            rows={leaveBalances}
            getRowKey={(balance) => balance._id.toString()}
            emptyMessage="No leave balances granted yet."
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
          currentPositionId={detail.currentAssignment?.positionId?.toString()}
          currentProjectId={detail.currentAssignment?.projectId?.toString()}
          currentReportsToEmployeeId={detail.currentAssignment?.reportsToEmployeeId?.toString()}
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
