import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { TravelOrderService } from "@/domains/travel-orders/travel-order-service";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { formatPersonName } from "@/lib/person-name";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { TravelOrderFormDialog } from "./travel-order-form-dialog";
import { CancelTravelOrderButton } from "./cancel-travel-order-button";

export default async function TravelOrdersPage() {
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("travel-orders.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view travel orders.</p>;
  }

  const [canCreate, canUpdate] = await Promise.all([
    hasPermission("travel-orders.create", organizationId),
    hasPermission("travel-orders.update", organizationId),
  ]);

  const [travelOrders, roster] = await Promise.all([
    TravelOrderService.listCurrent(organizationId),
    EmployeeService.listWithCurrentStatus(organizationId),
  ]);

  const employeeOptions = roster
    .filter((row) => row.person)
    .map((row) => ({ id: row._id.toString(), label: formatPersonName(row.person) }));
  const employeeNameById = new Map(employeeOptions.map((option) => [option.id, option.label]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Travel orders"
        description="Dispatch one or more employees for a date range."
        action={canCreate && <TravelOrderFormDialog organizationId={organizationId} employees={employeeOptions} />}
      />
      <DataTable
        caption="Travel orders"
        columns={[
          {
            key: "employees",
            header: "Employees",
            render: (order) => (
              <span className="font-medium">
                {order.employeeIds.map((id: { toString(): string }) => employeeNameById.get(id.toString()) ?? "—").join(", ")}
              </span>
            ),
          },
          {
            key: "dates",
            header: "Date range",
            render: (order) => `${new Date(order.startDate).toLocaleDateString()} – ${new Date(order.endDate).toLocaleDateString()}`,
          },
          { key: "remarks", header: "Remarks", render: (order) => order.remarks || "—" },
          { key: "status", header: "Status", render: (order) => <StatusBadge status={order.status} /> },
          {
            key: "action",
            header: "",
            render: (order) =>
              canUpdate && order.status !== "cancelled" ? (
                <div className="flex items-center gap-1">
                  <TravelOrderFormDialog
                    organizationId={organizationId}
                    employees={employeeOptions}
                    initialValue={{
                      id: order._id.toString(),
                      employeeIds: order.employeeIds.map((id: { toString(): string }) => id.toString()),
                      startDate: order.startDate.toISOString(),
                      endDate: order.endDate.toISOString(),
                      remarks: order.remarks,
                    }}
                  />
                  <CancelTravelOrderButton id={order._id.toString()} organizationId={organizationId} />
                </div>
              ) : null,
          },
        ]}
        rows={travelOrders}
        getRowKey={(order) => order._id.toString()}
        emptyMessage="No travel orders yet."
      />
    </div>
  );
}
