import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  Briefcase,
  CalendarDays,
  CalendarRange,
  FileText,
  Fingerprint,
  Hash,
  IdCard,
  LayoutGrid,
  Mail,
  Package,
  Palmtree,
  Phone,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import { formatLengthOfService } from "@/lib/employee-dates";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { EmploymentService } from "@/domains/workforce/employment-service";
import { documentExpiry, missingGovernmentIds, profileAtAGlance } from "@/domains/workforce/profile-summary";
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
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { MetricCard } from "@/components/shared/metric-card";
import { PageTabs } from "@/components/shared/page-tabs";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
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

const TABS = ["overview", "job", "leave", "documents", "assets"] as const;
type Tab = (typeof TABS)[number];
const SHORT_DATE = { month: "short", day: "numeric", year: "numeric" } as const;
const formatDate = (value: Date | string | null | undefined) => (value ? new Date(value).toLocaleDateString("en-US", SHORT_DATE) : "—");

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      {/* Long unbroken names ("Administrator/Property Manager") wrap instead of spilling into the next column. */}
      <dd className="text-sm font-medium [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

export default async function EmployeeDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ id }, { tab: tabParam }] = await Promise.all([params, searchParams]);
  const tab: Tab = (TABS as readonly string[]).includes(tabParam ?? "") ? (tabParam as Tab) : "overview";
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
  const isCurrentlyActive = detail.currentEmployment ? await EmploymentService.isActiveStatus(organizationId, detail.currentEmployment.status) : false;

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
    leaveBalances.map((balance) => LeaveBalanceService.getAvailable({ organizationId, employeeId: id, leaveTypeId: balance.leaveTypeId.toString(), year: balance.year })),
  );
  const availableByLeaveBalanceId = new Map(leaveBalances.map((balance, index) => [balance._id.toString(), leaveBalancesAvailable[index]]));
  const positionTitleById = new Map(positions.map((position) => [position._id.toString(), position.title]));
  const projectNameById = new Map(projects.map((project) => [project._id.toString(), project.name]));
  const employeeNameById = new Map(roster.filter((row) => row.person).map((row) => [row._id.toString(), formatPersonName(row.person)]));

  const now = new Date();
  const employeeId = detail.employee._id.toString();
  const personName = detail.person ? formatPersonName(detail.person) : "Employee";
  const assignment = detail.currentAssignment;
  const positionTitle = assignment?.positionId ? positionTitleById.get(assignment.positionId.toString()) : undefined;
  const projectName = assignment?.projectId ? projectNameById.get(assignment.projectId.toString()) : undefined;
  const managerId = assignment?.reportsToEmployeeId?.toString();
  const hiredOn = detail.currentEmployment?.effectiveFrom ? new Date(detail.currentEmployment.effectiveFrom) : null;
  const contractEnd = detail.currentEmployment?.endOfContract ? new Date(detail.currentEmployment.endOfContract) : null;
  const directReports = roster.filter((row) => row.currentAssignment?.reportsToEmployeeId?.toString() === employeeId && row.person);
  const missingIds = missingGovernmentIds(detail.person);
  const glance = profileAtAGlance(
    {
      year: now.getFullYear(),
      leave: leaveBalances.map((balance) => ({ year: balance.year, unlimited: Boolean(balance.hasNoFixedAmount), available: availableByLeaveBalanceId.get(balance._id.toString()) ?? null })),
      assets: issuedAssets,
      documents,
    },
    now,
  );
  const employmentType = detail.currentEmployment?.employmentType;
  const typeLabel = employmentType ? `${employmentType.charAt(0).toUpperCase()}${employmentType.slice(1)}` : null;

  const facts: { icon: LucideIcon; label: string; value: string }[] = [
    { icon: Hash, label: "Employee #", value: detail.employee.employeeNumber ?? "—" },
    { icon: CalendarDays, label: "Hired", value: hiredOn ? `${formatDate(hiredOn)} · ${formatLengthOfService(hiredOn)}` : "—" },
    { icon: Mail, label: "Email", value: detail.person?.email ?? "—" },
    { icon: Phone, label: "Phone", value: detail.person?.phone ?? "—" },
  ];
  const hrefFor = (value: Tab) => (value === "overview" ? `/people/${employeeId}` : `/people/${employeeId}?tab=${value}`);

  return (
    <div className="flex flex-col gap-6">
      {/* Profile header: who this is, where they sit, and how to reach them, above every tab. */}
      <section className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-[var(--shadow-soft)]" aria-label="Employee summary">
        <div className="flex flex-wrap items-start gap-4">
          <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-xl font-semibold text-primary" aria-hidden="true">
            {personName
              .split(" ")
              .filter(Boolean)
              .slice(0, 2)
              .map((part) => part[0])
              .join("")
              .toUpperCase()}
          </span>
          <div className="min-w-0 flex-1 basis-60">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{personName}</h1>
              {detail.currentEmployment && <StatusBadge status={detail.currentEmployment.status} />}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {[positionTitle, projectName, typeLabel].filter(Boolean).join(" · ") || "No current assignment"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {canUpdate && detail.person && (
              <EditEmployeeDialog
                organizationId={organizationId}
                employeeId={employeeId}
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
            )}
          </div>
        </div>
        <dl className="grid gap-3 border-t pt-4 sm:grid-cols-2 lg:grid-cols-4">
          {facts.map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex min-w-0 items-start gap-2.5">
              <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="truncate text-sm font-medium">{value}</dd>
              </div>
            </div>
          ))}
        </dl>
      </section>

      <PageTabs
        label="Employee sections"
        active={tab}
        tabs={[
          { value: "overview", label: "Overview", href: hrefFor("overview"), icon: LayoutGrid },
          { value: "job", label: "Job & history", href: hrefFor("job"), icon: Briefcase, count: detail.assignmentHistory.length },
          { value: "leave", label: "Leave", href: hrefFor("leave"), icon: Palmtree, count: leaveBalances.length },
          { value: "documents", label: "Documents", href: hrefFor("documents"), icon: FileText, count: documents.length },
          { value: "assets", label: "Assets", href: hrefFor("assets"), icon: Package, count: issuedAssets.length },
        ]}
      />

      {tab === "overview" && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <MetricCard
              label={`Leave left in ${now.getFullYear()}`}
              value={glance.hasUnlimitedLeave && glance.leaveDaysLeft === 0 ? "Unlimited" : `${glance.leaveDaysLeft.toFixed(glance.leaveDaysLeft % 1 ? 1 : 0)} days`}
              hint={leaveBalances.length ? `Across ${leaveBalances.filter((balance) => balance.year === now.getFullYear()).length} leave types` : "No leave granted yet"}
              icon={Palmtree}
              href={hrefFor("leave")}
            />
            <MetricCard label="Tenure" value={hiredOn ? formatLengthOfService(hiredOn) : "—"} hint={contractEnd ? `Contract ends ${formatDate(contractEnd)}` : "No end of contract"} icon={CalendarRange} />
            <MetricCard
              label="Documents"
              value={glance.documents}
              hint={glance.documentsNeedingAttention ? `${glance.documentsNeedingAttention} expired or expiring soon` : "None expiring soon"}
              icon={FileText}
              tone={glance.documentsNeedingAttention ? "warning" : "default"}
              href={hrefFor("documents")}
            />
            <MetricCard label="Assets out" value={glance.assetsOut} hint={`${issuedAssets.length} issued in total`} icon={Package} href={hrefFor("assets")} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Employment</CardTitle>
                <CardDescription>Status and terms</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <dl className="grid grid-cols-2 gap-3">
                  <Fact label="Status">{detail.currentEmployment ? <StatusBadge status={detail.currentEmployment.status} /> : "—"}</Fact>
                  <Fact label="Type">{typeLabel ?? "—"}</Fact>
                  <Fact label="Hired">{formatDate(hiredOn)}</Fact>
                  <Fact label="End of contract">{contractEnd ? formatDate(contractEnd) : "None"}</Fact>
                </dl>
                {canUpdate && isCurrentlyActive && <TerminateButton employeeId={employeeId} organizationId={organizationId} />}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Current assignment</CardTitle>
                <CardDescription>Where they work and who they report to</CardDescription>
                {canUpdate && (
                  <CardAction>
                    <Link href={hrefFor("job")} className="text-xs font-medium text-primary hover:underline">
                      Transfer
                    </Link>
                  </CardAction>
                )}
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-3">
                  <Fact label="Position">{positionTitle ?? "—"}</Fact>
                  <Fact label="Project">{projectName ?? "—"}</Fact>
                  <Fact label="Reports to">
                    {managerId && employeeNameById.get(managerId) ? (
                      <Link href={`/people/${managerId}`} className="text-primary hover:underline">
                        {employeeNameById.get(managerId)}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </Fact>
                  <Fact label="Direct reports">{directReports.length}</Fact>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Government IDs</CardTitle>
                <CardDescription>Needed for SSS, PhilHealth, Pag-IBIG and BIR remittance</CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-3">
                  {(
                    [
                      ["SSS", detail.person?.sssNumber],
                      ["PhilHealth", detail.person?.philHealthNumber],
                      ["Pag-IBIG", detail.person?.pagIbigNumber],
                      ["TIN", detail.person?.tinNumber],
                    ] as const
                  ).map(([label, value]) => (
                    <Fact key={label} label={label}>
                      {value ? <span className="font-mono text-[13px] tabular-nums">{value}</span> : <span className="font-normal text-warning">Missing</span>}
                    </Fact>
                  ))}
                </dl>
                {missingIds.length > 0 && (
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <IdCard className="size-3.5" aria-hidden="true" />
                    Add them with Edit details.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Self-service access</CardTitle>
              <CardDescription>Clocking in and out from their own phone</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-4">
              {selfServiceAccount ? (
                <>
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                    <span className="flex items-center gap-2">
                      <Smartphone className="size-4 text-muted-foreground" aria-hidden="true" />
                      Signs in as <span className="font-medium">{selfServiceAccount.username}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Fingerprint className="size-4 text-muted-foreground" aria-hidden="true" />
                      <StatusBadge status={hasBiometricCredential ? "on" : "off"} label={hasBiometricCredential ? "Biometric set up" : "Biometric not set up"} tone={hasBiometricCredential ? "success" : "neutral"} />
                    </span>
                  </div>
                  {canUpdate && hasBiometricCredential && <ResetBiometricButton organizationId={organizationId} userId={selfServiceAccount._id.toString()} />}
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">No self-service login yet, so they can&apos;t clock in or out on their own device.</p>
                  {canUpdate && <CreateEmployeeAccountDialog organizationId={organizationId} employeeId={employeeId} suggestedUsername={detail.employee.employeeNumber?.toLowerCase()} />}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "job" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <Card className="self-start">
            <CardHeader>
              <CardTitle className="text-base">Assignment history</CardTitle>
              <CardDescription>Every position, project and manager change, newest first</CardDescription>
            </CardHeader>
            <CardContent>
              {detail.assignmentHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground">No assignment history yet.</p>
              ) : (
                <ol className="relative flex flex-col gap-5 border-l pl-6">
                  {[...detail.assignmentHistory]
                    .sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime())
                    .map((row) => {
                      const current = !row.effectiveTo;
                      const manager = row.reportsToEmployeeId ? employeeNameById.get(row.reportsToEmployeeId.toString()) : undefined;
                      return (
                        <li key={row._id.toString()} className="relative">
                          <span
                            className={cn("absolute top-1 -left-[1.95rem] size-3 rounded-full border-2 border-card", current ? "bg-primary ring-3 ring-primary/20" : "bg-muted-foreground/40")}
                            aria-hidden="true"
                          />
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {formatDate(row.effectiveFrom)} – {current ? "Present" : formatDate(row.effectiveTo)}
                            {current && <span className="ml-2 font-medium text-primary">Current</span>}
                          </p>
                          <p className="mt-0.5 font-medium">{row.positionId ? (positionTitleById.get(row.positionId.toString()) ?? "Unknown position") : "No position"}</p>
                          <p className="text-sm text-muted-foreground">
                            {[row.projectId ? projectNameById.get(row.projectId.toString()) : null, manager ? `Reports to ${manager}` : null].filter(Boolean).join(" · ") || "No project or manager"}
                          </p>
                        </li>
                      );
                    })}
                </ol>
              )}
            </CardContent>
          </Card>
          {canUpdate && (
            <TransferForm
              employeeId={employeeId}
              organizationId={organizationId}
              positions={positions.map((position) => ({ id: position._id.toString(), label: position.title }))}
              projects={projects.map((project) => ({ id: project._id.toString(), label: project.name }))}
              managers={roster.filter((row) => row.person && row._id.toString() !== employeeId).map((row) => ({ id: row._id.toString(), label: formatPersonName(row.person) }))}
              currentPositionId={assignment?.positionId?.toString()}
              currentProjectId={assignment?.projectId?.toString()}
              currentReportsToEmployeeId={managerId}
            />
          )}
        </div>
      )}

      {tab === "leave" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Leave balances</CardTitle>
            <CardDescription>Entitlements by year, with adjustments and what&apos;s left</CardDescription>
            {canUpdate && (
              <CardAction>
                <GrantLeaveBalanceDialog organizationId={organizationId} employeeId={employeeId} leaveTypes={leaveTypeOptions} />
              </CardAction>
            )}
          </CardHeader>
          <CardContent>
            <DataTable
              columns={[
                { key: "leaveType", header: "Leave type", render: (balance) => <span className="font-medium">{leaveTypeNameById.get(balance.leaveTypeId.toString()) ?? "—"}</span> },
                { key: "year", header: "Year", render: (balance) => balance.year },
                { key: "entitled", header: "Entitled", render: (balance) => (balance.hasNoFixedAmount ? "Unlimited" : balance.entitledDays.toFixed(2)) },
                { key: "adjustment", header: "Adjustment", render: (balance) => balance.adjustmentDays.toFixed(2) },
                {
                  key: "available",
                  header: "Available",
                  render: (balance) => {
                    if (balance.hasNoFixedAmount) return "Unlimited";
                    const value = availableByLeaveBalanceId.get(balance._id.toString());
                    return value !== undefined ? <span className="font-medium tabular-nums">{value.toFixed(2)}</span> : "—";
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
              emptyDescription="Grant a balance per leave type, or grant everyone at once from Leave › Balances."
            />
          </CardContent>
        </Card>
      )}

      {tab === "documents" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Documents</CardTitle>
            <CardDescription>Contracts, IDs and certificates on file, with expiry dates</CardDescription>
            {canUpdate && (
              <CardAction>
                <DocumentFormDialog organizationId={organizationId} employeeId={employeeId} documentTypes={documentTypeOptions} />
              </CardAction>
            )}
          </CardHeader>
          <CardContent>
            <DataTable
              columns={[
                { key: "title", header: "Title", render: (document) => <span className="font-medium">{document.title}</span> },
                { key: "type", header: "Type", render: (document) => documentTypeNameByCode.get(document.documentType) ?? document.documentType },
                { key: "fileName", header: "File", render: (document) => <span className="text-muted-foreground">{document.fileName}</span> },
                {
                  key: "expires",
                  header: "Expires",
                  render: (document) => {
                    const state = documentExpiry(document.expiresAt, now);
                    if (state === "none") return <span className="text-muted-foreground">No expiry</span>;
                    return (
                      <span className="flex items-center gap-2 whitespace-nowrap">
                        {formatDate(document.expiresAt)}
                        {state === "expired" && <StatusBadge status="expired" label="Expired" tone="danger" />}
                        {state === "expiring" && <StatusBadge status="expiring" label="Expiring soon" tone="warning" />}
                      </span>
                    );
                  },
                },
                { key: "uploaded", header: "Uploaded", render: (document) => formatDate(document.createdAt) },
                {
                  key: "action",
                  header: "",
                  render: (document) => (
                    <div className="flex items-center gap-1">
                      <DocumentDownloadButton employeeId={employeeId} documentId={document._id.toString()} organizationId={organizationId} fileName={document.fileName} />
                      {canUpdate && (
                        <DocumentFormDialog
                          organizationId={organizationId}
                          employeeId={employeeId}
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
              emptyDescription="Upload the employment contract, government IDs and certificates so they're in one place."
            />
          </CardContent>
        </Card>
      )}

      {tab === "assets" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Issued assets</CardTitle>
            <CardDescription>Equipment, uniforms and IDs handed over, and whether they came back</CardDescription>
            {canUpdate && (
              <CardAction>
                <AssetIssuanceFormDialog organizationId={organizationId} employeeId={employeeId} />
              </CardAction>
            )}
          </CardHeader>
          <CardContent>
            <DataTable
              columns={[
                { key: "assetName", header: "Asset", render: (record) => <span className="font-medium">{record.assetName}</span> },
                { key: "type", header: "Type", render: (record) => record.assetType || "—" },
                { key: "serial", header: "Serial #", render: (record) => <span className="font-mono text-xs">{record.serialNumber || "—"}</span> },
                { key: "condition", header: "Condition", render: (record) => record.condition },
                { key: "issued", header: "Issued", render: (record) => formatDate(record.issuedDate) },
                {
                  key: "returned",
                  header: "Returned",
                  render: (record) => (record.returnedDate ? formatDate(record.returnedDate) : <StatusBadge status="out" label="Still out" tone="info" />),
                },
                {
                  key: "action",
                  header: "",
                  render: (record) =>
                    canUpdate ? (
                      <AssetIssuanceFormDialog
                        organizationId={organizationId}
                        employeeId={employeeId}
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
              emptyDescription="Log equipment, uniforms or IDs when they're handed over, and mark them returned at clearance."
            />
          </CardContent>
        </Card>
      )}

      {missingIds.length > 0 && tab === "overview" && (
        <p className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          Missing {missingIds.join(", ")}: payroll can&apos;t remit contributions for them until these are on file.
        </p>
      )}
    </div>
  );
}
