import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { PayrollPolicyService } from "@/domains/payroll/payroll-policy-service";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { CreatePayrollPolicyForm } from "./create-payroll-policy-form";

export default async function PayrollPoliciesPage() {
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("payroll-policies.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view payroll policies.</p>;
  }

  const policies = await PayrollPolicyService.listCurrent(organizationId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Payroll policies" description="Pay frequency and standard work days used to prorate basic salary." />
      <CreatePayrollPolicyForm organizationId={organizationId} />
      <DataTable
        columns={[
          { key: "name", header: "Name", render: (policy) => <span className="font-medium">{policy.name}</span> },
          { key: "frequency", header: "Pay frequency", render: (policy) => policy.payFrequency },
          { key: "days", header: "Work days / period", render: (policy) => policy.standardWorkDaysPerPeriod },
          { key: "status", header: "Status", render: (policy) => <StatusBadge status={policy.status} /> },
        ]}
        rows={policies}
        getRowKey={(policy) => policy._id.toString()}
        emptyMessage="No payroll policies yet."
      />
    </div>
  );
}
