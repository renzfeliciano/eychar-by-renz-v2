import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { CompensationService } from "@/domains/payroll/compensation-service";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { formatPersonName as employeeName } from "@/lib/person-name";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { CreateCompensationDialog } from "./create-compensation-dialog";
import { ReviseDialog } from "./revise-dialog";

export default async function CompensationPage() {
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("compensation.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view compensation.</p>;
  }

  const canUpdate = await hasPermission("compensation.update", organizationId);

  const [compensationRecords, employees] = await Promise.all([
    CompensationService.listCurrent(organizationId),
    EmployeeService.listWithCurrentStatus(organizationId),
  ]);
  const employeeById = new Map(employees.map((employee) => [employee._id.toString(), employee]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Compensation"
        description="Base salary and allowance per pay period, per employee."
        action={
          <CreateCompensationDialog
            organizationId={organizationId}
            employees={employees.map((employee) => ({ id: employee._id.toString(), label: employeeName(employee.person) }))}
          />
        }
      />
      <DataTable
        caption="Compensation"
        columns={[
          {
            key: "employee",
            header: "Employee",
            render: (compensation) => employeeName(employeeById.get(compensation.employeeId.toString())?.person ?? null),
          },
          { key: "baseSalary", header: "Base salary", render: (compensation) => compensation.baseSalary },
          { key: "allowance", header: "Allowance", render: (compensation) => compensation.allowanceAmount },
          {
            key: "action",
            header: "",
            render: (compensation) =>
              canUpdate ? (
                <ReviseDialog
                  organizationId={organizationId}
                  employeeId={compensation.employeeId.toString()}
                  currentBaseSalary={compensation.baseSalary}
                  currentAllowanceAmount={compensation.allowanceAmount}
                />
              ) : null,
          },
        ]}
        rows={compensationRecords}
        getRowKey={(compensation) => compensation._id.toString()}
        emptyMessage="No compensation records yet."
      />
    </div>
  );
}
