import type { Metadata } from "next";
import Link from "next/link";
import { HideToggle } from "@/components/shared/hide-toggle";
import { DeleteRecordButton } from "@/components/shared/delete-record-button";
import { isSuperAdmin } from "@/app/_shared/is-super-admin";
import { notFound } from "next/navigation";
import {
  BadgeCheck,
  Briefcase,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Fingerprint,
  Hash,
  IdCard,
  LayoutGrid,
  LogOut,
  Mail,
  Package,
  Palmtree,
  Phone,
  Plane,
  Smartphone,
  Star,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { formatLengthOfService } from "@/lib/employee-dates";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { EmploymentService } from "@/domains/workforce/employment-service";
import { missingGovernmentIds, profileAttention, type AttentionTone } from "@/domains/workforce/profile-summary";
import { PositionService } from "@/domains/organization/position-service";
import { ProjectService } from "@/domains/organization/project-service";
import { EmployeeAccountService } from "@/domains/identity/employee-account-service";
import { WebAuthnService } from "@/domains/identity/webauthn-service";
import { AssetIssuanceService } from "@/domains/assets/asset-issuance-service";
import { EmployeeDocumentService } from "@/domains/documents/employee-document-service";
import { DocumentTypeService } from "@/domains/catalog/document-type-service";
import { LeaveBalanceService } from "@/domains/leave/leave-balance-service";
import { LeaveRequestService } from "@/domains/leave/leave-request-service";
import { LeaveTypeService } from "@/domains/leave/leave-type-service";
import { AttendanceService } from "@/domains/attendance/attendance-service";
import { CompensationService } from "@/domains/payroll/compensation-service";
import { PerformanceReviewService } from "@/domains/performance/performance-review-service";
import { EmployeeRecords } from "@/domains/people/employee-records";
import { NotFoundError } from "@/shared/errors";
import { formatPersonName } from "@/lib/person-name";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/shared/status-badge";
import { PageTabs } from "@/components/shared/page-tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TerminateButton } from "./terminate-button";
import { EditEmployeeDialog } from "./edit-employee-dialog";
import { CreateEmployeeAccountDialog } from "./create-employee-account-dialog";
import { ResetBiometricButton } from "./reset-biometric-button";
import { Fact, formatDate } from "./profile-format";
import { JobTab } from "./job-tab";
import { LeaveTab } from "./leave-tab";
import { DocumentsTab } from "./documents-tab";
import { AssetsTab } from "./assets-tab";
import { AttendanceTab, LeaveRequestsCard, OffboardingTab, PayTab, PerformanceTab, TravelTab } from "./records-tabs";
import { NoAccessState } from "@/components/shared/no-access-state";

export const metadata: Metadata = { title: "Employee profile" };

// Everything about one employee, one tab per module (ADR-047). The sidebar
// modules stay; these tabs are the same records filtered to this person.
const TABS = ["overview", "job", "leave", "attendance", "pay", "documents", "assets", "travel", "performance", "offboarding"] as const;
type Tab = (typeof TABS)[number];
const OBJECT_ID = /^[a-f0-9]{24}$/i;
const ATTENDANCE_DAYS = 60;

const TONE: Record<AttentionTone, { dot: string; text: string }> = {
  danger: { dot: "bg-destructive", text: "text-destructive" },
  warning: { dot: "bg-warning", text: "text-warning" },
  info: { dot: "bg-primary", text: "text-foreground" },
};

export default async function EmployeeDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ id }, { tab: tabParam }] = await Promise.all([params, searchParams]);
  const requestedTab: Tab = (TABS as readonly string[]).includes(tabParam ?? "") ? (tabParam as Tab) : "overview";
  const { organization } = await getCurrentOrganization();
  if (!organization) return <NoAccessState needed="A role in an organization" message="Your account isn't part of an organization yet." />;

  const organizationId = organization._id.toString();
  const superAdmin = await isSuperAdmin(organizationId);
  if (!(await hasPermission("employees.read", organizationId))) {
    return <NoAccessState permission="employees.read" message="You don't have access to view this employee." />;
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
  // someone's documents, leave, pay or anything else, so each query is
  // skipped (not just hidden) without the matching read permission.
  const PERMISSIONS = [
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
    "leave.read",
    "attendance.read",
    "compensation.read",
    "payroll-runs.read",
    "travel-orders.read",
    "performance-reviews.read",
    "clearance.read",
    "final-settlements.read",
  ] as const;
  const granted = await Promise.all(PERMISSIONS.map((permission) => hasPermission(permission, organizationId)));
  const can = Object.fromEntries(PERMISSIONS.map((permission, index) => [permission, granted[index]])) as Record<(typeof PERMISSIONS)[number], boolean>;
  const canUpdate = can["employees.update"];

  const tabAllowed: Record<Tab, boolean> = {
    overview: true,
    job: true,
    leave: can["leave-balances.read"] || can["leave.read"],
    attendance: can["attendance.read"],
    pay: can["compensation.read"] || can["payroll-runs.read"],
    documents: can["employee-documents.read"],
    assets: can["asset-issuances.read"],
    travel: can["travel-orders.read"],
    performance: can["performance-reviews.read"],
    offboarding: can["clearance.read"],
  };
  const tab: Tab = tabAllowed[requestedTab] ? requestedTab : "overview";
  const on = (value: Tab) => tab === value;
  // Load a section only for the tab that shows it (or the overview's checks).
  const load = <T,>(when: boolean, query: () => Promise<T>, empty: T): Promise<T> => (when ? query() : Promise.resolve(empty));

  const now = new Date();
  const [positions, projects, selfServiceAccount, isCurrentlyActive, documents, documentTypes, leaveBalances, leaveTypes, leaveRequests, payTerms, offboarding] = await Promise.all([
    PositionService.listCurrent(organizationId),
    ProjectService.listCurrent(organizationId),
    EmployeeAccountService.getForEmployee(id, organizationId),
    detail.currentEmployment ? EmploymentService.isActiveStatus(organizationId, detail.currentEmployment.status) : Promise.resolve(false),
    load(can["employee-documents.read"] && (on("overview") || on("documents")), () => EmployeeDocumentService.listForEmployee(id, organizationId), []),
    load(on("documents"), () => DocumentTypeService.listCurrent(organizationId), []),
    load(can["leave-balances.read"] && on("leave"), () => LeaveBalanceService.listForEmployee(id, organizationId), []),
    load(on("leave"), () => LeaveTypeService.listCurrent(organizationId), []),
    load(can["leave.read"] && (on("overview") || on("leave")), () => LeaveRequestService.listForEmployee(id, organizationId), []),
    load(can["compensation.read"] && (on("overview") || on("pay")), () => CompensationService.listHistory(id, organizationId), []),
    load(can["clearance.read"] && (on("overview") || on("offboarding")), () => EmployeeRecords.offboarding(id, organizationId), []),
  ]);
  const [issuedAssets, attendance, payslips, travelOrders, reviews] = await Promise.all([
    load(can["asset-issuances.read"] && on("assets"), () => AssetIssuanceService.listForEmployee(id, organizationId), []),
    load(on("attendance"), () => AttendanceService.listForEmployee(id, organizationId, { from: new Date(now.getTime() - ATTENDANCE_DAYS * 86_400_000) }), []),
    load(can["payroll-runs.read"] && on("pay"), () => EmployeeRecords.payslips(id, organizationId), []),
    load(on("travel"), () => EmployeeRecords.travelOrders(id, organizationId), []),
    load(on("performance"), () => PerformanceReviewService.listForEmployee(id, organizationId), []),
  ]);
  const hasBiometricCredential = selfServiceAccount && on("overview") ? await WebAuthnService.hasRegisteredCredential(selfServiceAccount._id.toString()) : false;

  const positionTitleById = new Map(positions.map((position) => [position._id.toString(), position.title]));
  const projectNameById = new Map(projects.map((project) => [project._id.toString(), project.name]));
  const leaveTypeNameById = new Map(leaveTypes.map((leaveType) => [leaveType._id.toString(), leaveType.name]));

  const employeeId = detail.employee._id.toString();
  const personName = detail.person ? formatPersonName(detail.person) : "Employee";
  const assignment = detail.currentAssignment;
  const positionTitle = assignment?.positionId ? positionTitleById.get(assignment.positionId.toString()) : undefined;
  const projectName = assignment?.projectId ? projectNameById.get(assignment.projectId.toString()) : undefined;
  const hiredOn = detail.currentEmployment?.effectiveFrom ? new Date(detail.currentEmployment.effectiveFrom) : null;
  const contractEnd = detail.currentEmployment?.endOfContract ? new Date(detail.currentEmployment.endOfContract) : null;
  const missingIds = missingGovernmentIds(detail.person);
  const employmentType = detail.currentEmployment?.employmentType;
  const typeLabel = employmentType ? `${employmentType.charAt(0).toUpperCase()}${employmentType.slice(1)}` : null;
  const openClearance = offboarding.find((item) => item.status === "in_clearance") ?? null;

  const attention = on("overview")
    ? profileAttention(
        {
          active: isCurrentlyActive,
          contractEnd,
          hasPosition: Boolean(assignment?.positionId && assignment?.projectId),
          missingIds,
          documents: can["employee-documents.read"] ? documents : undefined,
          pendingLeave: can["leave.read"] ? leaveRequests.filter((request) => request.status === "pending").length : undefined,
          openClearance: can["clearance.read"] ? openClearance : undefined,
          hasPayTerms: can["compensation.read"] ? payTerms.some((terms) => !terms.effectiveTo || new Date(terms.effectiveTo).getTime() > now.getTime()) : undefined,
          hasSelfServiceLogin: Boolean(selfServiceAccount),
        },
        now,
      )
    : [];

  // Every fact once: the header holds who and where; the tabs hold the rest.
  const facts: { icon: LucideIcon; label: string; value: string }[] = [
    { icon: Hash, label: "Employee #", value: detail.employee.employeeNumber ?? "—" },
    { icon: CalendarDays, label: "Hired", value: hiredOn ? `${formatDate(hiredOn)} · ${formatLengthOfService(hiredOn)}` : "—" },
    { icon: CalendarClock, label: "Contract ends", value: contractEnd ? formatDate(contractEnd) : "No end date" },
    { icon: Mail, label: "Email", value: detail.person?.email ?? "—" },
    { icon: Phone, label: "Phone", value: detail.person?.phone ?? "—" },
  ];
  const hrefFor = (value: string) => (value === "overview" ? `/people/${employeeId}` : `/people/${employeeId}?tab=${value}`);
  const TAB_LIST: { value: Tab; label: string; icon: LucideIcon }[] = [
    { value: "overview", label: "Overview", icon: LayoutGrid },
    { value: "job", label: "Job & history", icon: Briefcase },
    { value: "leave", label: "Leave", icon: Palmtree },
    { value: "attendance", label: "Attendance", icon: ClipboardCheck },
    { value: "pay", label: "Pay", icon: Wallet },
    { value: "documents", label: "Documents", icon: FileText },
    { value: "assets", label: "Assets", icon: Package },
    { value: "travel", label: "Travel", icon: Plane },
    { value: "performance", label: "Performance", icon: Star },
    { value: "offboarding", label: "Offboarding", icon: LogOut },
  ];

  return (
    <div className="flex flex-col gap-6">
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
            <p className="mt-1 text-sm text-muted-foreground">{[positionTitle, projectName, typeLabel].filter(Boolean).join(" · ") || "No current assignment"}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {superAdmin && <HideToggle organizationId={organizationId} type="employee" id={employeeId} label={personName} hidden={Boolean(detail.employee.hiddenFromOthers)} />}
            {superAdmin && <DeleteRecordButton organizationId={organizationId} type="employee" id={employeeId} afterDeleteHref="/people" />}
            {canUpdate && isCurrentlyActive && <TerminateButton employeeId={employeeId} organizationId={organizationId} />}
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
        <dl className="grid gap-3 border-t pt-4 sm:grid-cols-2 lg:grid-cols-5">
          {facts.map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex min-w-0 items-start gap-2.5">
              <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="truncate text-sm font-medium" title={value}>
                  {value}
                </dd>
              </div>
            </div>
          ))}
        </dl>
      </section>

      <PageTabs
        label="Employee sections"
        active={tab}
        tabs={TAB_LIST.filter((item) => tabAllowed[item.value]).map((item) => ({ ...item, href: hrefFor(item.value) }))}
      />

      {on("overview") && (
        <div className="flex flex-col gap-4">
          <Card data-testid="profile-attention" className={attention.length ? "border-t-4 border-t-amber-500" : "border-t-4 border-t-emerald-500"}>
            <CardHeader>
              <CardTitle className="text-base">Needs attention</CardTitle>
              <CardDescription>{attention.length ? "About this person, most urgent first" : "Nothing outstanding for this person."}</CardDescription>
            </CardHeader>
            <CardContent>
              {attention.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <BadgeCheck className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  Records, contract and documents are in order.
                </p>
              ) : (
                <ul className="flex flex-col divide-y">
                  {attention.map((item) => (
                    <li key={item.key}>
                      <Link href={item.tab === "overview" ? "#government-ids" : hrefFor(item.tab)} className="group flex items-center gap-3 py-2.5 text-sm">
                        <span className={cn("size-2 shrink-0 rounded-full", TONE[item.tone].dot)} aria-hidden="true" />
                        <span className={cn("min-w-0 flex-1", TONE[item.tone].text)}>{item.text}</span>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card id="government-ids">
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
                {missingIds.length > 0 && canUpdate && (
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <IdCard className="size-3.5" aria-hidden="true" />
                    Add them with Edit details.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Self-service access</CardTitle>
                <CardDescription>Clocking in and out from their own phone</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {selfServiceAccount ? (
                  <>
                    <p className="flex items-center gap-2 text-sm">
                      <Smartphone className="size-4 text-muted-foreground" aria-hidden="true" />
                      Signs in as <span className="font-medium">{selfServiceAccount.username}</span>
                    </p>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="flex items-center gap-2">
                        <Fingerprint className="size-4 text-muted-foreground" aria-hidden="true" />
                        <StatusBadge status={hasBiometricCredential ? "on" : "off"} label={hasBiometricCredential ? "Biometric set up" : "Biometric not set up"} tone={hasBiometricCredential ? "success" : "neutral"} />
                      </span>
                      {canUpdate && hasBiometricCredential && <ResetBiometricButton organizationId={organizationId} userId={selfServiceAccount._id.toString()} />}
                    </div>
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
        </div>
      )}

      {on("job") && (
        <JobTab
          organizationId={organizationId}
          employeeId={employeeId}
          assignmentHistory={detail.assignmentHistory}
          positionTitleById={positionTitleById}
          projectNameById={projectNameById}
          canUpdate={canUpdate}
          positionOptions={positions.map((position) => ({ id: position._id.toString(), label: position.title }))}
          projectOptions={projects.map((project) => ({ id: project._id.toString(), label: project.name }))}
          currentPositionId={assignment?.positionId?.toString()}
          currentProjectId={assignment?.projectId?.toString()}
        />
      )}

      {on("leave") && (
        <div className="flex flex-col gap-4">
          {can["leave-balances.read"] && (
            <LeaveTab
              organizationId={organizationId}
              employeeId={employeeId}
              leaveBalances={leaveBalances}
              leaveTypeOptions={leaveTypes.map((leaveType) => ({ id: leaveType._id.toString(), label: leaveType.name }))}
              leaveTypeNameById={leaveTypeNameById}
              availableByLeaveBalanceId={new Map(
                await Promise.all(
                  leaveBalances.map(async (balance) => [balance._id.toString(), await LeaveBalanceService.getAvailable({ organizationId, employeeId: id, leaveTypeId: balance.leaveTypeId.toString(), year: balance.year })] as const),
                ),
              )}
              canCreateLeave={can["leave-balances.create"]}
              canUpdateLeave={can["leave-balances.update"]}
            />
          )}
          {can["leave.read"] && (
            <LeaveRequestsCard
              requests={leaveRequests.map((request) => ({
                id: request._id.toString(),
                type: leaveTypeNameById.get(request.leaveTypeId.toString()) ?? "Leave",
                startDate: request.startDate,
                endDate: request.endDate,
                totalDays: request.totalDays,
                status: request.status ?? "pending",
                reason: request.reason ?? undefined,
              }))}
            />
          )}
        </div>
      )}

      {on("attendance") && (
        <AttendanceTab
          days={ATTENDANCE_DAYS}
          records={attendance.map((record) => ({ id: record._id.toString(), date: record.date, checkInAt: record.checkInAt, checkOutAt: record.checkOutAt, status: record.status }))}
        />
      )}

      {on("pay") && (
        <PayTab
          showTerms={can["compensation.read"]}
          showPayslips={can["payroll-runs.read"]}
          terms={payTerms.map((terms) => ({
            id: terms._id.toString(),
            rateType: terms.rateType,
            rate: terms.rate,
            allowances: ((terms.allowances ?? []) as { amount: number }[]).reduce((sum, allowance) => sum + allowance.amount, 0),
            effectiveFrom: terms.effectiveFrom,
            effectiveTo: terms.effectiveTo,
            reason: terms.reason ?? undefined,
          }))}
          payslips={payslips}
        />
      )}

      {on("documents") && (
        <DocumentsTab
          organizationId={organizationId}
          employeeId={employeeId}
          documents={documents}
          documentTypeOptions={documentTypes.map((item) => ({ id: item.code, label: item.name }))}
          documentTypeNameByCode={new Map(documentTypes.map((item) => [item.code, item.name]))}
          canCreateDocuments={can["employee-documents.create"]}
          canUpdateDocuments={can["employee-documents.update"]}
          now={now}
        />
      )}

      {on("assets") && <AssetsTab organizationId={organizationId} employeeId={employeeId} issuedAssets={issuedAssets} canCreateAssets={can["asset-issuances.create"]} canUpdateAssets={can["asset-issuances.update"]} />}

      {on("travel") && (
        <TravelTab
          orders={travelOrders.map((order) => ({
            id: order._id.toString(),
            startDate: order.startDate,
            endDate: order.endDate,
            remarks: order.remarks,
            status: order.status,
            companions: order.employeeIds.length - 1,
          }))}
        />
      )}

      {on("performance") && (
        <PerformanceTab
          reviews={await (async () => {
            const names = await EmployeeRecords.reviewCycleNames(organizationId, reviews.map((review) => review.reviewCycleId));
            return reviews.map((review) => ({
              id: review._id.toString(),
              cycleId: review.reviewCycleId.toString(),
              cycle: names.get(review.reviewCycleId.toString()) ?? "Review cycle",
              rating: review.ratingCode ?? undefined,
              status: review.status,
              submittedAt: review.submittedAt,
            }));
          })()}
        />
      )}

      {on("offboarding") && <OffboardingTab cases={offboarding} showSettlements={can["final-settlements.read"]} />}
    </div>
  );
}
