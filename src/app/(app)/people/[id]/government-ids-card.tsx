import { DataTable } from "@/components/shared/data-table";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { catalogChoiceName, type CatalogChoiceItem } from "@/domains/catalog/catalog-choice-options";
import type { GovernmentIdRecordView } from "@/domains/people/government-id-record-service";
import { ExpiryChip } from "./expiry-chip";
import { GovernmentIdDialog, RemoveGovernmentIdButton } from "./government-id-dialog";

const LONG_TEXT = "block max-md:line-clamp-2 max-md:break-words";

/** The ID's type for display: the name HR typed for "Other", else the catalog name (active or retired), else the stored code. */
function typeLabel(types: CatalogChoiceItem[], record: GovernmentIdRecordView): string {
  return record.otherTypeName ?? catalogChoiceName(types, record.typeCode);
}

/**
 * Additional government IDs, beyond SSS, PhilHealth, Pag-IBIG and TIN (which have their own card): a driver's
 * license, passport, UMID and so on, several per type, each with an optional validity date and an expiry chip.
 * Anyone who can see the profile sees the list; only an updater gets the controls.
 */
export function GovernmentIdsCard({
  organizationId,
  employeeId,
  employeeName,
  records,
  types,
  todayKey,
  canUpdate,
}: {
  organizationId: string;
  employeeId: string;
  employeeName?: string;
  records: GovernmentIdRecordView[];
  types: CatalogChoiceItem[];
  todayKey: string;
  canUpdate: boolean;
}) {
  return (
    <Card id="additional-government-ids">
      <CardHeader>
        <CardTitle>Additional government IDs</CardTitle>
        <CardDescription>Driver&apos;s license, passport, UMID and other IDs on record</CardDescription>
        {canUpdate && (
          <CardAction>
            <GovernmentIdDialog organizationId={organizationId} employeeId={employeeId} employeeName={employeeName} types={types} />
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <DataTable
          columns={[
            { key: "type", header: "ID type", width: "lg" as const, render: (record) => <span className={`${LONG_TEXT} font-medium`}>{typeLabel(types, record)}</span> },
            { key: "number", header: "ID number", width: "fill" as const, render: (record) => <span className={`${LONG_TEXT} font-mono text-[13px] tabular-nums`}>{record.idNumber}</span> },
            {
              key: "validUntil",
              header: "Valid until",
              truncate: false,
              render: (record) => (
                <span className="flex flex-wrap items-center gap-2">
                  <span>{record.validUntil ?? "—"}</span>
                  <ExpiryChip validUntil={record.validUntil} todayKey={todayKey} />
                </span>
              ),
            },
            ...(canUpdate
              ? [
                  {
                    key: "actions",
                    header: "",
                    truncate: false,
                    render: (record: GovernmentIdRecordView) => (
                      <div className="flex justify-end">
                        <GovernmentIdDialog organizationId={organizationId} employeeId={employeeId} employeeName={employeeName} types={types} record={record} />
                        <RemoveGovernmentIdButton organizationId={organizationId} employeeId={employeeId} recordId={record.id} label={`${typeLabel(types, record)} ${record.idNumber}`} />
                      </div>
                    ),
                  },
                ]
              : []),
          ]}
          rows={records}
          getRowKey={(record) => record.id}
          emptyMessage="No additional government IDs yet."
          emptyDescription={canUpdate ? "Add IDs such as a driver's license or passport, with the date each stops being valid." : undefined}
        />
      </CardContent>
    </Card>
  );
}
