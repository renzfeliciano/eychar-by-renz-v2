import type { AssetIssuanceService } from "@/domains/assets/asset-issuance-service";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AssetIssuanceFormDialog } from "./asset-issuance-form-dialog";
import { formatDate } from "./profile-format";

/** The Assets tab: what was issued, and whether it came back. */
export function AssetsTab({
  organizationId,
  employeeId,
  issuedAssets,
  canCreateAssets,
  canUpdateAssets,
}: {
  organizationId: string;
  employeeId: string;
  issuedAssets: Awaited<ReturnType<typeof AssetIssuanceService.listForEmployee>>;
  canCreateAssets: boolean;
  canUpdateAssets: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Issued assets</CardTitle>
        <CardDescription>Equipment, uniforms and IDs handed over, and whether they came back</CardDescription>
        {canCreateAssets && (
          <CardAction>
            <AssetIssuanceFormDialog organizationId={organizationId} employeeId={employeeId} />
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <DataTable
          columns={[
            { key: "assetName", header: "Asset", render: (record) => <span className="font-medium">{record.assetName}</span> },
            { key: "type", header: "Type", mobile: "subtitle", render: (record) => record.assetType || "—" },
            { key: "serial", header: "Serial #", mobile: "hidden", render: (record) => <span className="font-mono text-xs">{record.serialNumber || "—"}</span> },
            { key: "condition", header: "Condition", render: (record) => record.condition },
            { key: "issued", header: "Issued", render: (record) => formatDate(record.issuedDate) },
            {
              key: "returned",
              header: "Returned",
              render: (record) => (record.returnedDate ? formatDate(record.returnedDate) : <StatusBadge status="out" label="Still out" tone="info" />),
            },
            {
              key: "action",
              header: "",
              render: (record) =>
                canUpdateAssets ? (
                  <AssetIssuanceFormDialog
                    organizationId={organizationId}
                    employeeId={employeeId}
                    initialValue={{
                      id: record._id.toString(),
                      assetName: record.assetName,
                      assetType: record.assetType,
                      serialNumber: record.serialNumber,
                      condition: record.condition,
                      issuedDate: record.issuedDate.toISOString(),
                      returnedDate: record.returnedDate?.toISOString(),
                      remarks: record.remarks,
                    }}
                  />
                ) : null,
            },
          ]}
          rows={issuedAssets}
          getRowKey={(record) => record._id.toString()}
          emptyMessage="No assets logged yet."
          emptyDescription="Log equipment, uniforms or IDs when they're handed over, and mark them returned at clearance."
        />
      </CardContent>
    </Card>
  );
}
