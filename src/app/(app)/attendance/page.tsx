import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { AttendanceService } from "@/domains/attendance/attendance-service";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { DateNav } from "./date-nav";
import { RecordDialog } from "./record-dialog";

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatTime(value?: Date | null): string {
  if (!value) return "—";
  return `${String(new Date(value).getUTCHours()).padStart(2, "0")}:${String(new Date(value).getUTCMinutes()).padStart(2, "0")}`;
}

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date: dateParam } = await searchParams;
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("attendance.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view attendance.</p>;
  }

  const date = dateParam ? new Date(dateParam) : new Date();
  const canRecord = await hasPermission("attendance.create", organizationId);

  const [roster, records] = await Promise.all([
    EmployeeService.listWithCurrentStatus(organizationId),
    AttendanceService.listForOrganization(organizationId, { date }),
  ]);
  const recordByEmployeeId = new Map(records.map((record) => [record.employeeId.toString(), record]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Attendance" description="Daily attendance recorded on behalf of employees." />

      <DateNav date={toDateInputValue(date)} />

      <DataTable
        columns={[
          {
            key: "name",
            header: "Employee",
            render: (row) => (row.person ? `${row.person.firstName} ${row.person.lastName}` : "—"),
          },
          {
            key: "status",
            header: "Status",
            render: (row) => <StatusBadge status={recordByEmployeeId.get(row._id.toString())?.status ?? null} />,
          },
          { key: "checkIn", header: "Check-in", render: (row) => formatTime(recordByEmployeeId.get(row._id.toString())?.checkInAt) },
          { key: "checkOut", header: "Check-out", render: (row) => formatTime(recordByEmployeeId.get(row._id.toString())?.checkOutAt) },
          {
            key: "action",
            header: "",
            render: (row) => {
              if (!canRecord) return null;
              const existing = recordByEmployeeId.get(row._id.toString());
              return (
                <RecordDialog
                  organizationId={organizationId}
                  employeeId={row._id.toString()}
                  date={toDateInputValue(date)}
                  existingRecordId={existing?._id.toString()}
                  initialCheckInAt={existing?.checkInAt}
                  initialCheckOutAt={existing?.checkOutAt}
                  initialStatus={existing?.status}
                />
              );
            },
          },
        ]}
        rows={roster}
        getRowKey={(row) => row._id.toString()}
        emptyMessage="No employees yet."
      />
    </div>
  );
}
