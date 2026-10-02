import type { Metadata } from "next";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { HideToggle } from "@/components/shared/hide-toggle";
import { DeleteRecordButton } from "@/components/shared/delete-record-button";
import { isSuperAdmin } from "@/app/_shared/is-super-admin";
import { hasPermission } from "@/app/_shared/has-permission";
import { CircleCheck, ListChecks, ShieldQuestion, TriangleAlert } from "lucide-react";
import { LeaveTypeService } from "@/domains/leave/leave-type-service";
import { LeavePolicyService } from "@/domains/leave/leave-policy-service";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { DataTable } from "@/components/shared/data-table";
import { ConvertibleToggle } from "./convertible-toggle";
import { StatusBadge } from "@/components/shared/status-badge";
import { LeaveTypeFormDialog } from "./leave-type-form-dialog";
import { DeleteLeaveTypeButton } from "./delete-leave-type-button";
import { NoAccessState } from "@/components/shared/no-access-state";

export const metadata: Metadata = { title: "Leave types" };

export default async function LeaveTypesPage() {
  const { organization } = await getCurrentOrganization();
  if (!organization) return <NoAccessState needed="A role in an organization" message="Your account isn't part of an organization yet." />;

  const organizationId = organization._id.toString();
  const superAdmin = await isSuperAdmin(organizationId);
  if (!(await hasPermission("leave-types.read", organizationId))) {
    return <NoAccessState permission="leave-types.read" message="You don't have access to view leave types." />;
  }

  const [canUpdate, canDelete] = await Promise.all([
    hasPermission("leave-types.update", organizationId),
    hasPermission("leave-types.delete", organizationId),
  ]);

  const [leaveTypes, policies] = await Promise.all([LeaveTypeService.listCurrent(organizationId), LeavePolicyService.listCurrent(organizationId)]);
  const active = leaveTypes.filter((leaveType) => leaveType.status !== "inactive");
  const needApproval = active.filter((leaveType) => leaveType.requiresApproval).length;
  const withPolicy = new Set(policies.filter((policy) => policy.status !== "inactive").map((policy) => policy.leaveTypeId.toString()));
  const withoutPolicy = active.filter((leaveType) => !withPolicy.has(leaveType._id.toString())).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Leave types"
        description="The configurable catalog of leave an organization offers."
        action={<LeaveTypeFormDialog organizationId={organizationId} />}
      />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="Active leave types" value={active.length} hint={`${leaveTypes.length - active.length} retired`} icon={ListChecks} emphasis />
        <MetricCard label="Need approval" value={needApproval} hint="Go to an approver before they count" icon={ShieldQuestion} />
        <MetricCard label="With an entitlement" value={active.length - withoutPolicy} hint="Days granted by a leave policy" icon={CircleCheck} tone="success" />
        <MetricCard
          label="Without a policy"
          value={withoutPolicy}
          hint={withoutPolicy ? "Add one under Leave › Policies" : "Every type has an entitlement"}
          icon={TriangleAlert}
          tone={withoutPolicy ? "warning" : "default"}
          href={withoutPolicy ? "/leave/policies" : undefined}
        />
      </div>
      <DataTable
        caption="Leave types"
        columns={[
          {
            key: "name",
            header: "Leave type",
            render: (leaveType) => (
              <div className="flex flex-col">
                <span className="font-medium">{leaveType.name}</span>
                {leaveType.description && <span className="line-clamp-1 max-w-md text-xs whitespace-normal text-muted-foreground">{leaveType.description}</span>}
              </div>
            ),
          },
          { key: "code", header: "Code", mobile: "subtitle", render: (leaveType) => <span className="font-mono text-xs">{leaveType.code}</span> },
          {
            key: "approval",
            header: "Approval",
            render: (leaveType) =>
              leaveType.requiresApproval ? <StatusBadge status="required" label="Required" tone="info" /> : <span className="text-sm text-muted-foreground">Automatic</span>,
          },
          {
            key: "convertible",
            header: "Paid out at separation",
            render: (leaveType) => (
              <ConvertibleToggle
                organizationId={organizationId}
                leaveTypeId={leaveType._id.toString()}
                name={leaveType.name}
                checked={Boolean(leaveType.convertibleAtSeparation)}
                disabled={!canUpdate}
              />
            ),
          },
          { key: "status", header: "Status", render: (leaveType) => <StatusBadge status={leaveType.status} /> },
          {
            key: "action",
            header: "",
            render: (leaveType) =>
              canUpdate || canDelete ? (
                <div className="flex items-center gap-1">
                  {canUpdate && (
                    <LeaveTypeFormDialog
                      organizationId={organizationId}
                      initialValue={{
                        id: leaveType._id.toString(),
                        name: leaveType.name,
                        code: leaveType.code,
                        description: leaveType.description,
                      }}
                    />
                  )}
                  {canDelete && <DeleteLeaveTypeButton id={leaveType._id.toString()} name={leaveType.name} organizationId={organizationId} />}
                </div>
              ) : null,
          },
          {
            key: "delete",
            header: "",
            className: "w-10",
            render: (row) =>
              superAdmin ? (
                <span className="flex items-center justify-end gap-0.5">
                  <HideToggle organizationId={organizationId} type="leave-type" id={row._id.toString()} label={String(row.name)} hidden={Boolean(row.hiddenFromOthers)} />
                  <DeleteRecordButton organizationId={organizationId} type="leave-type" id={row._id.toString()} iconOnly />
                </span>
              ) : null,
          },
        ]}
        rows={leaveTypes}
        getRowKey={(leaveType) => leaveType._id.toString()}
        emptyMessage="No leave types yet."
        emptyDescription="Add the kinds of leave you offer (vacation, sick, solo parent, …), then set entitlements under Policies."
        emptyAction={<LeaveTypeFormDialog organizationId={organizationId} />}
      />
    </div>
  );
}
