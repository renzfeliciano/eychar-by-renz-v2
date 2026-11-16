import { DataTable } from "@/components/shared/data-table";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { catalogChoiceName, type CatalogChoiceItem } from "@/domains/catalog/catalog-choice-options";
import type { ProfessionalLicenseRecordView } from "@/domains/people/professional-license-record-service";
import { ExpiryChip } from "./expiry-chip";
import { PrcLicenseDialog, RemovePrcLicenseButton } from "./prc-license-dialog";

const LONG_TEXT = "block max-md:line-clamp-2 max-md:break-words";

/**
 * PRC licenses: the profession, the license number and when it expires, several per person, with an expiry
 * chip so renewals are seen in time. Anyone who can see the profile sees the list; only an updater gets the controls.
 */
export function PrcLicensesCard({
  organizationId,
  employeeId,
  employeeName,
  records,
  professions,
  todayKey,
  canUpdate,
}: {
  organizationId: string;
  employeeId: string;
  employeeName?: string;
  records: ProfessionalLicenseRecordView[];
  professions: CatalogChoiceItem[];
  todayKey: string;
  canUpdate: boolean;
}) {
  return (
    <Card id="prc-licenses">
      <CardHeader>
        <CardTitle>PRC licenses</CardTitle>
        <CardDescription>Professional licenses and when each expires</CardDescription>
        {canUpdate && (
          <CardAction>
            <PrcLicenseDialog organizationId={organizationId} employeeId={employeeId} employeeName={employeeName} professions={professions} />
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <DataTable
          columns={[
            { key: "profession", header: "Profession", width: "lg" as const, render: (record) => <span className={`${LONG_TEXT} font-medium`}>{catalogChoiceName(professions, record.professionCode)}</span> },
            { key: "number", header: "License number", width: "fill" as const, render: (record) => <span className={`${LONG_TEXT} font-mono text-[13px] tabular-nums`}>{record.licenseNumber}</span> },
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
                    render: (record: ProfessionalLicenseRecordView) => (
                      <div className="flex justify-end">
                        <PrcLicenseDialog organizationId={organizationId} employeeId={employeeId} employeeName={employeeName} professions={professions} record={record} />
                        <RemovePrcLicenseButton organizationId={organizationId} employeeId={employeeId} recordId={record.id} label={`${catalogChoiceName(professions, record.professionCode)} license ${record.licenseNumber}`} />
                      </div>
                    ),
                  },
                ]
              : []),
          ]}
          rows={records}
          getRowKey={(record) => record.id}
          emptyMessage="No PRC licenses yet."
          emptyDescription={canUpdate ? "Add the employee's professional licenses, with the expiry date so renewals aren't missed." : undefined}
        />
      </CardContent>
    </Card>
  );
}
