import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { LeaveBalanceService } from "@/domains/leave/leave-balance-service";
import { LeaveTypeService } from "@/domains/leave/leave-type-service";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { CreateLeaveBalanceForm } from "./create-leave-balance-form";

function employeeName(person: { firstName: string; lastName: string } | null): string {
  return person ? `${person.firstName} ${person.lastName}` : "—";
}

export default async function LeaveBalancesPage() {
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("leave-balances.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view leave balances.</p>;
  }

  const [balances, leaveTypes, employees] = await Promise.all([
    LeaveBalanceService.listCurrent(organizationId),
    LeaveTypeService.listCurrent(organizationId),
    EmployeeService.listWithCurrentStatus(organizationId),
  ]);
  const leaveTypeNameById = new Map(leaveTypes.map((leaveType) => [leaveType._id.toString(), leaveType.name]));
  const employeeById = new Map(employees.map((employee) => [employee._id.toString(), employee]));

  const available = await Promise.all(
    balances.map((balance) =>
      LeaveBalanceService.getAvailable({
        organizationId,
        employeeId: balance.employeeId.toString(),
        leaveTypeId: balance.leaveTypeId.toString(),
        year: balance.year,
      }),
    ),
  );
  const availableByBalanceId = new Map(balances.map((balance, index) => [balance._id.toString(), available[index]]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Leave balances" description="Entitlement and adjustments per employee, leave type, and year." />
      <CreateLeaveBalanceForm
        organizationId={organizationId}
        employees={employees.map((employee) => ({ id: employee._id.toString(), label: employeeName(employee.person) }))}
        leaveTypes={leaveTypes.map((leaveType) => ({ id: leaveType._id.toString(), label: leaveType.name }))}
      />
      <DataTable
        columns={[
          {
            key: "employee",
            header: "Employee",
            render: (balance) => employeeName(employeeById.get(balance.employeeId.toString())?.person ?? null),
          },
          { key: "leaveType", header: "Leave type", render: (balance) => leaveTypeNameById.get(balance.leaveTypeId.toString()) ?? "—" },
          { key: "year", header: "Year", render: (balance) => balance.year },
          { key: "entitled", header: "Entitled", render: (balance) => balance.entitledDays },
          { key: "adjustment", header: "Adjustment", render: (balance) => balance.adjustmentDays },
          { key: "available", header: "Available", render: (balance) => availableByBalanceId.get(balance._id.toString()) ?? "—" },
        ]}
        rows={balances}
        getRowKey={(balance) => balance._id.toString()}
        emptyMessage="No leave balances yet."
      />
    </div>
  );
}
