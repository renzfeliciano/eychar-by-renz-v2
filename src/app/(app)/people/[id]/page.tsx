import type { Metadata } from "next";
import Link from "next/link";
import { HideToggle } from "@/components/shared/hide-toggle";
import { DeleteRecordButton } from "@/components/shared/delete-record-button";
import { isSuperAdmin } from "@/app/_shared/is-super-admin";
import { notFound } from "next/navigation";
import { AlertTriangle, Briefcase, CalendarDays, CalendarRange, FileText, Fingerprint, Hash, IdCard, LayoutGrid, Mail, Package, Palmtree, Phone, Smartphone, type LucideIcon } from "lucide-react";
import { formatLengthOfService } from "@/lib/employee-dates";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { EmploymentService } from "@/domains/workforce/employment-service";
import { missingGovernmentIds, profileAtAGlance } from "@/domains/workforce/profile-summary";
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
import { StatusBadge } from "@/components/shared/status-badge";
import { MetricCard } from "@/components/shared/metric-card";
import { PageTabs } from "@/components/shared/page-tabs";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TerminateButton } from "./terminate-button";
import { EditEmployeeDialog } from "./edit-employee-dialog";
import { CreateEmployeeAccountDialog } from "./create-employee-account-dialog";
import { ResetBiometricButton } from "./reset-biometric-button";
import { Fact, formatDate } from "./profile-format";
import { JobTab } from "./job-tab";
import { LeaveTab } from "./leave-tab";
import { DocumentsTab } from "./documents-tab";
import { AssetsTab } from "./assets-tab";

export const metadata: Metadata = { title: "Employee profile" };

const TABS = ["overview", "job", "leave", "documents", "assets"] as const;
type Tab = (typeof TABS)[number];
const OBJECT_ID = /^[a-f0-9]{24}$/i;


export default async function EmployeeDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ id }, { tab: tabParam }] = await Promise.all([params, searchParams]);
  const requestedTab: Tab = (TABS as readonly string[]).includes(tabParam ?? "") ? (tabParam as Tab) : "overview";
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  const superAdmin = await isSuperAdmin(organizationId);
  if (!(await hasPermission("employees.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view this employee.</p>;
  }

  if (!OBJECT_ID.test(id)) notFound();

  let detail;
  try {
    detail = await EmployeeService.getDetail(id, organizationId);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  // Each section has its own permission: employees.read alone doesn't open
  // someone's documents, leave or assets, so each query is skipped (not just
  // hidden) without the matching read permission.
  const [canUpdate, canReadDocuments, canCreateDocuments, canUpdateDocuments, canReadLeave, canCreateLeave, canUpdateLeave, canReadAssets, canCreateAssets, canUpdateAssets] =
    await Promise.all(
      [
        "employees.update",
        "employee-documents.read",
        "employee-documents.create",
        "employee-documents.update",
        "leave-balances.read",
        "leave-balances.create",
        "leave-balances.update",
        "asset-issuances.read",
        "asset-issuances.create",
        "asset-issuances.update",
      ].map((permission) => hasPermission(permission, organizationId)),
    );
  const isCurrentlyActive = detail.currentEmployment ? await EmploymentService.isActiveStatus(organizationId, detail.currentEmployment.status) : false;
  const ifAllowed = <T,>(allowed: boolean, load: () => Promise<T[]>): Promise<T[]> => (allowed ? load() : Promise.resolve([]));

  const [positions, projects, roster, selfServiceAccount, issuedAssets, documents, documentTypes, leaveBalances, leaveTypes] = await Promise.all([
    PositionService.listCurrent(organizationId),
    ProjectService.listCurrent(organizationId),
    EmployeeService.listWithCurrentStatus(organizationId),
    EmployeeAccountService.getForEmployee(id, organizationId),
    ifAllowed(canReadAssets, () => AssetIssuanceService.listForEmployee(id, organizationId)),
    ifAllowed(canReadDocuments, () => EmployeeDocumentService.listForEmployee(id, organizationId)),
    ifAllowed(canReadDocuments, () => DocumentTypeService.listCurrent(organizationId)),
    ifAllowed(canReadLeave, () => LeaveBalanceService.listForEmployee(id, organizationId)),
    ifAllowed(canReadLeave, () => LeaveTypeService.listCurrent(organizationId)),
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
  const tabAllowed: Record<Tab, boolean> = { overview: true, job: true, leave: canReadLeave, documents: canReadDocuments, assets: canReadAssets };
  const tab: Tab = tabAllowed[requestedTab] ? requestedTab : "overview";
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
            {superAdmin && <HideToggle organizationId={organizationId} type="employee" id={employeeId} label={personName} hidden={Boolean(detail.employee.hiddenFromOthers)} />}
            {superAdmin && <DeleteRecordButton organizationId={organizationId} type="employee" id={employeeId} afterDeleteHref="/people" />}
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
        ].filter((item) => tabAllowed[item.value as Tab])}
      />

      {tab === "overview" && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {canReadLeave && (
            <MetricCard
              label={`Leave left in ${now.getFullYear()}`}
              value={glance.hasUnlimitedLeave && glance.leaveDaysLeft === 0 ? "Unlimited" : `${glance.leaveDaysLeft.toFixed(glance.leaveDaysLeft % 1 ? 1 : 0)} days`}
              hint={leaveBalances.length ? `Across ${leaveBalances.filter((balance) => balance.year === now.getFullYear()).length} leave types` : "No leave granted yet"}
              icon={Palmtree}
              href={hrefFor("leave")}
            />
            )}
            <MetricCard label="Tenure" value={hiredOn ? formatLengthOfService(hiredOn) : "—"} hint={contractEnd ? `Contract ends ${formatDate(contractEnd)}` : "No end of contract"} icon={CalendarRange} />
            {canReadDocuments && (
            <MetricCard
              label="Documents"
              value={glance.documents}
              hint={glance.documentsNeedingAttention ? `${glance.documentsNeedingAttention} expired or expiring soon` : "None expiring soon"}
              icon={FileText}
              tone={glance.documentsNeedingAttention ? "warning" : "default"}
              href={hrefFor("documents")}
            />
            )}
            {canReadAssets && <MetricCard label="Assets out" value={glance.assetsOut} hint={`${issuedAssets.length} issued in total`} icon={Package} href={hrefFor("assets")} />}
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
        <JobTab
          organizationId={organizationId}
          employeeId={employeeId}
          assignmentHistory={detail.assignmentHistory}
          positionTitleById={positionTitleById}
          projectNameById={projectNameById}
          employeeNameById={employeeNameById}
          canUpdate={canUpdate}
          positionOptions={positions.map((position) => ({ id: position._id.toString(), label: position.title }))}
          projectOptions={projects.map((project) => ({ id: project._id.toString(), label: project.name }))}
          managerOptions={roster.filter((row) => row.person && row._id.toString() !== employeeId).map((row) => ({ id: row._id.toString(), label: formatPersonName(row.person) }))}
          currentPositionId={assignment?.positionId?.toString()}
          currentProjectId={assignment?.projectId?.toString()}
          managerId={managerId}
        />
      )}

      {tab === "leave" && canReadLeave && (
        <LeaveTab
          organizationId={organizationId}
          employeeId={employeeId}
          leaveBalances={leaveBalances}
          leaveTypeOptions={leaveTypeOptions}
          leaveTypeNameById={leaveTypeNameById}
          availableByLeaveBalanceId={availableByLeaveBalanceId}
          canCreateLeave={canCreateLeave}
          canUpdateLeave={canUpdateLeave}
        />
      )}

      {tab === "documents" && canReadDocuments && (
        <DocumentsTab
          organizationId={organizationId}
          employeeId={employeeId}
          documents={documents}
          documentTypeOptions={documentTypeOptions}
          documentTypeNameByCode={documentTypeNameByCode}
          canCreateDocuments={canCreateDocuments}
          canUpdateDocuments={canUpdateDocuments}
          now={now}
        />
      )}

      {tab === "assets" && canReadAssets && <AssetsTab organizationId={organizationId} employeeId={employeeId} issuedAssets={issuedAssets} canCreateAssets={canCreateAssets} canUpdateAssets={canUpdateAssets} />}

      {missingIds.length > 0 && tab === "overview" && (
        <p className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          Missing {missingIds.join(", ")}: payroll can&apos;t remit contributions for them until these are on file.
        </p>
      )}
    </div>
  );
}
