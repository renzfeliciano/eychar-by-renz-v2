import type { LeaveBalanceService } from "@/domains/leave/leave-balance-service";
import { DataTable } from "@/components/shared/data-table";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AdjustLeaveBalanceDialog } from "@/components/shared/adjust-leave-balance-dialog";
import { GrantLeaveBalanceDialog } from "./grant-leave-balance-dialog";

/** The Leave tab: balances by type and year, with grant and adjust. */
export function LeaveTab({
  organizationId,
  employeeId,
  leaveBalances,
  leaveTypeOptions,
  leaveTypeNameById,
  availableByLeaveBalanceId,
  canCreateLeave,
  canUpdateLeave,
}: {
  organizationId: string;
  employeeId: string;
  leaveBalances: Awaited<ReturnType<typeof LeaveBalanceService.listForEmployee>>;
  leaveTypeOptions: { id: string; label: string }[];
  leaveTypeNameById: Map<string, string>;
  availableByLeaveBalanceId: Map<string, number | undefined>;
  canCreateLeave: boolean;
  canUpdateLeave: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Leave balances</CardTitle>
        <CardDescription>Entitlements by year, with adjustments and what&apos;s left</CardDescription>
        {canCreateLeave && (
          <CardAction>
            <GrantLeaveBalanceDialog organizationId={organizationId} employeeId={employeeId} leaveTypes={leaveTypeOptions} />
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <DataTable
          columns={[
            { key: "leaveType", header: "Leave type", render: (balance) => <span className="font-medium">{leaveTypeNameById.get(balance.leaveTypeId.toString()) ?? "—"}</span> },
            { key: "year", header: "Year", render: (balance) => balance.year },
            { key: "entitled", header: "Entitled", render: (balance) => (balance.hasNoFixedAmount ? "Unlimited" : balance.entitledDays.toFixed(2)) },
            { key: "adjustment", header: "Adjustment", mobile: "hidden", render: (balance) => balance.adjustmentDays.toFixed(2) },
            {
              key: "available",
              header: "Available",
              render: (balance) => {
                if (balance.hasNoFixedAmount) return "Unlimited";
                const value = availableByLeaveBalanceId.get(balance._id.toString());
                return value !== undefined ? <span className="font-medium tabular-nums">{value.toFixed(2)}</span> : "—";
              },
            },
            {
              key: "action",
              header: "",
              render: (balance) =>
                canUpdateLeave ? (
                  <AdjustLeaveBalanceDialog
                    organizationId={organizationId}
                    balanceId={balance._id.toString()}
                    leaveTypeLabel={leaveTypeNameById.get(balance.leaveTypeId.toString()) ?? "leave"}
                    currentAdjustmentDays={balance.adjustmentDays}
                  />
                ) : null,
            },
          ]}
          rows={leaveBalances}
          getRowKey={(balance) => balance._id.toString()}
          emptyMessage="No leave balances granted yet."
          emptyDescription="Grant a balance per leave type, or grant everyone at once from Leave › Balances."
        />
      </CardContent>
    </Card>
  );
}
