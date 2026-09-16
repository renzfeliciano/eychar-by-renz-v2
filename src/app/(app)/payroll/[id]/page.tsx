import { notFound } from "next/navigation";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { PayrollService } from "@/domains/payroll/payroll-service";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { NotFoundError } from "@/shared/errors";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApproveButton } from "../approve-button";

function employeeName(person: { firstName: string; lastName: string } | null): string {
  return person ? `${person.firstName} ${person.lastName}` : "—";
}

function formatDate(value: Date): string {
  return new Date(value).toISOString().slice(0, 10);
}

export default async function PayrollRunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("payroll-runs.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view this payroll run.</p>;
  }

  let detail;
  try {
    detail = await PayrollService.getRunDetail(id, organizationId);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const canApprove = await hasPermission("payroll.approve", organizationId);

  const employees = await EmployeeService.listWithCurrentStatus(organizationId);
  const employeeById = new Map(employees.map((employee) => [employee._id.toString(), employee]));
  const adjustmentsByEmployeeId = new Map<string, typeof detail.adjustments>();
  for (const adjustment of detail.adjustments) {
    const key = adjustment.employeeId.toString();
    adjustmentsByEmployeeId.set(key, [...(adjustmentsByEmployeeId.get(key) ?? []), adjustment]);
  }

  const totalNetPay = detail.records.reduce((sum, record) => sum + record.netPay, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Payroll run: ${formatDate(detail.run.payPeriodStart)} – ${formatDate(detail.run.payPeriodEnd)}`}
        description={`${detail.records.length} employee(s), total net pay ${totalNetPay.toFixed(2)}`}
        action={
          <div className="flex items-center gap-2">
            <StatusBadge status={detail.run.status} />
            {canApprove && detail.run.status === "completed" && (
              <ApproveButton runId={detail.run._id.toString()} organizationId={organizationId} />
            )}
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reproducibility</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Policy ID: {detail.run.policyId.toString()} · Rule version ID: {detail.run.ruleVersionId.toString()} · Generated at{" "}
          {formatDate(detail.run.createdAt)}
        </CardContent>
      </Card>

      <DataTable
        columns={[
          {
            key: "employee",
            header: "Employee",
            render: (record) => employeeName(employeeById.get(record.employeeId.toString())?.person ?? null),
          },
          { key: "basic", header: "Basic salary", render: (record) => record.basicSalary.toFixed(2) },
          { key: "allowance", header: "Allowance", render: (record) => record.allowanceAmount.toFixed(2) },
          { key: "gross", header: "Gross pay", render: (record) => record.grossPay.toFixed(2) },
          { key: "tax", header: "Tax", render: (record) => record.taxDeduction.toFixed(2) },
          {
            key: "statutory",
            header: "Statutory",
            render: (record) =>
              record.statutoryDeductions
                .map((line: { name: string; employeeAmount: number }) => `${line.name}: ${line.employeeAmount.toFixed(2)}`)
                .join(", ") || "—",
          },
          { key: "adjustments", header: "Adjustments", render: (record) => record.adjustmentsTotal.toFixed(2) },
          { key: "net", header: "Net pay", render: (record) => <span className="font-medium">{record.netPay.toFixed(2)}</span> },
        ]}
        rows={detail.records}
        getRowKey={(record) => record._id.toString()}
        emptyMessage="No records in this run."
      />
    </div>
  );
}
