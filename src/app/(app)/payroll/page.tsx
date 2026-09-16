import Link from "next/link";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { PayrollService } from "@/domains/payroll/payroll-service";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { PayrollRecordModel } from "@/server/db/models";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { GenerateRunDialog } from "./generate-run-dialog";
import { ApproveButton } from "./approve-button";

function employeeName(person: { firstName: string; lastName: string } | null): string {
  return person ? `${person.firstName} ${person.lastName}` : "—";
}

function formatDate(value: Date): string {
  return new Date(value).toISOString().slice(0, 10);
}

export default async function PayrollPage() {
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("payroll-runs.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view payroll runs.</p>;
  }

  const [canGenerate, canApprove] = await Promise.all([
    hasPermission("payroll-runs.create", organizationId),
    hasPermission("payroll.approve", organizationId),
  ]);

  const [runs, employees] = await Promise.all([
    PayrollService.listRuns(organizationId),
    EmployeeService.listWithCurrentStatus(organizationId),
  ]);

  const netPayByRunId = new Map<string, number>();
  for (const run of runs) {
    const records = await PayrollRecordModel.find({ payrollRunId: run._id }).lean();
    netPayByRunId.set(run._id.toString(), records.reduce((sum, record) => sum + record.netPay, 0));
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Payroll"
        description="Generated runs, computed from resolved policy and rule version, with an approval step."
        action={
          canGenerate ? (
            <GenerateRunDialog
              organizationId={organizationId}
              employees={employees.map((employee) => ({ id: employee._id.toString(), label: employeeName(employee.person) }))}
            />
          ) : undefined
        }
      />

      <DataTable
        columns={[
          {
            key: "period",
            header: "Pay period",
            render: (run) => (
              <Link href={`/payroll/${run._id.toString()}`} className="font-medium text-primary hover:underline">
                {formatDate(run.payPeriodStart)} – {formatDate(run.payPeriodEnd)}
              </Link>
            ),
          },
          { key: "netPay", header: "Total net pay", render: (run) => (netPayByRunId.get(run._id.toString()) ?? 0).toFixed(2) },
          { key: "status", header: "Status", render: (run) => <StatusBadge status={run.status} /> },
          {
            key: "action",
            header: "",
            render: (run) => (canApprove && run.status === "completed" ? <ApproveButton runId={run._id.toString()} organizationId={organizationId} /> : null),
          },
        ]}
        rows={runs}
        getRowKey={(run) => run._id.toString()}
        emptyMessage="No payroll runs yet."
      />
    </div>
  );
}
