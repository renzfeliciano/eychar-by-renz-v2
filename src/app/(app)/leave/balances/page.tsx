import Link from "next/link";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { LeaveBalanceService } from "@/domains/leave/leave-balance-service";
import { LeaveTypeService } from "@/domains/leave/leave-type-service";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { formatPersonName as employeeName } from "@/lib/person-name";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { TableSearchInput } from "@/components/shared/table-search-input";
import { AdjustLeaveBalanceDialog } from "@/components/shared/adjust-leave-balance-dialog";
import { parseTableQuery, applyTableQuery, buildTableHref } from "@/lib/table-query";
import { CreateLeaveBalanceDialog } from "./create-leave-balance-dialog";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function LeaveBalancesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("leave-balances.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view leave balances.</p>;
  }

  const canUpdate = await hasPermission("leave-balances.update", organizationId);

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

  const tableQuery = parseTableQuery(params, "employee");
  const { rows: pageRows, total } = applyTableQuery(balances, tableQuery, {
    searchFields: (balance) => [
      employeeName(employeeById.get(balance.employeeId.toString())?.person ?? null),
      leaveTypeNameById.get(balance.leaveTypeId.toString()),
    ],
    sortValues: {
      employee: (balance) => employeeName(employeeById.get(balance.employeeId.toString())?.person ?? null),
      leaveType: (balance) => leaveTypeNameById.get(balance.leaveTypeId.toString()) ?? "",
      year: (balance) => balance.year,
      entitled: (balance) => (balance.hasNoFixedAmount ? Infinity : balance.entitledDays),
      adjustment: (balance) => balance.adjustmentDays,
      available: (balance) => (balance.hasNoFixedAmount ? Infinity : (availableByBalanceId.get(balance._id.toString()) ?? 0)),
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Leave balances"
        description="Entitlement and adjustments per employee, leave type, and year."
        action={
          <CreateLeaveBalanceDialog
            organizationId={organizationId}
            employees={employees.map((employee) => ({ id: employee._id.toString(), label: employeeName(employee.person) }))}
            leaveTypes={leaveTypes.map((leaveType) => ({ id: leaveType._id.toString(), label: leaveType.name }))}
          />
        }
      />
      <TableSearchInput placeholder="Search by employee or leave type…" />
      <DataTable
        caption="Leave balances"
        sort={{
          sortBy: tableQuery.sort,
          sortDir: tableQuery.dir,
          buildHref: (sortKey) =>
            buildTableHref("/leave/balances", params, {
              sort: sortKey,
              dir: tableQuery.sort === sortKey && tableQuery.dir === "asc" ? "desc" : "asc",
              page: undefined,
            }),
        }}
        pagination={{
          page: tableQuery.page,
          pageSize: tableQuery.pageSize,
          total,
          buildHref: (page, pageSize) => buildTableHref("/leave/balances", params, { page, pageSize }),
        }}
        columns={[
          {
            key: "employee",
            header: "Employee",
            sortKey: "employee",
            className: "sticky left-0 z-10 border-r bg-card",
            render: (balance) => (
              <Link href={`/people/${balance.employeeId.toString()}`} className="font-medium text-primary hover:underline">
                {employeeName(employeeById.get(balance.employeeId.toString())?.person ?? null)}
              </Link>
            ),
          },
          { key: "leaveType", header: "Leave type", sortKey: "leaveType", render: (balance) => leaveTypeNameById.get(balance.leaveTypeId.toString()) ?? "—" },
          { key: "year", header: "Year", sortKey: "year", render: (balance) => balance.year },
          {
            key: "entitled",
            header: "Entitled",
            sortKey: "entitled",
            render: (balance) => (balance.hasNoFixedAmount ? "Unlimited" : balance.entitledDays.toFixed(2)),
          },
          { key: "adjustment", header: "Adjustment", sortKey: "adjustment", render: (balance) => balance.adjustmentDays.toFixed(2) },
          {
            key: "available",
            header: "Available",
            sortKey: "available",
            render: (balance) => {
              if (balance.hasNoFixedAmount) return "Unlimited";
              const value = availableByBalanceId.get(balance._id.toString());
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
        rows={pageRows}
        getRowKey={(balance) => balance._id.toString()}
        emptyMessage="No leave balances yet."
      />
    </div>
  );
}
