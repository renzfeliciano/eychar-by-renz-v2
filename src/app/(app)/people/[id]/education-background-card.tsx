import { DataTable } from "@/components/shared/data-table";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { educationLevelName, type EducationLevelItem } from "@/domains/catalog/education-level-options";
import type { EducationRecordView } from "@/domains/people/education-record-service";
import { EducationRecordDialog, RemoveEducationButton } from "./education-record-dialog";

// School and course names can run to 200 characters. On desktop the table cuts them with an ellipsis and
// a hover tooltip (TruncatedCell). On a phone the row is a stacked card, so they clamp to two lines with an
// ellipsis instead, and break inside a very long word so nothing pushes the card wider than the screen.
const LONG_TEXT = "block max-md:line-clamp-2 max-md:break-words";

/**
 * Educational background, under the employee's personal information: each school, course and graduation
 * year, several per level. Anyone who can see the profile sees the list; only an updater gets the controls.
 *
 * Column widths: School takes the spare room, since it is the longest and most useful text; Level and
 * Year hug their content; Course gets a wider cap than the default so a degree name has room.
 */
export function EducationBackgroundCard({
  organizationId,
  employeeId,
  employeeName,
  records,
  levels,
  canUpdate,
}: {
  organizationId: string;
  employeeId: string;
  employeeName?: string;
  records: EducationRecordView[];
  levels: EducationLevelItem[];
  canUpdate: boolean;
}) {
  const entryLabel = (record: EducationRecordView) => (record.course ? `${record.course} at ${record.school}` : record.school);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Educational background</CardTitle>
        <CardDescription>Schools, courses and graduation years on record</CardDescription>
        {canUpdate && (
          <CardAction>
            <EducationRecordDialog organizationId={organizationId} employeeId={employeeId} employeeName={employeeName} levels={levels} />
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <DataTable
          columns={[
            { key: "level", header: "Level", width: "md" as const, render: (record) => <span className={`${LONG_TEXT} font-medium`}>{educationLevelName(levels, record.levelCode)}</span> },
            { key: "school", header: "School", width: "fill" as const, render: (record) => <span className={LONG_TEXT}>{record.school}</span> },
            { key: "course", header: "Course or degree", width: "lg" as const, render: (record) => <span className={LONG_TEXT}>{record.course ?? "—"}</span> },
            { key: "year", header: "Year graduated", width: "sm" as const, render: (record) => (record.yearGraduated ? String(record.yearGraduated) : "—") },
            ...(canUpdate
              ? [
                  {
                    key: "actions",
                    header: "",
                    truncate: false,
                    render: (record: EducationRecordView) => (
                      <div className="flex justify-end">
                        <EducationRecordDialog organizationId={organizationId} employeeId={employeeId} employeeName={employeeName} levels={levels} record={record} />
                        <RemoveEducationButton organizationId={organizationId} employeeId={employeeId} recordId={record.id} label={entryLabel(record)} />
                      </div>
                    ),
                  },
                ]
              : []),
          ]}
          rows={records}
          getRowKey={(record) => record.id}
          emptyMessage="No education entries yet."
          emptyDescription={canUpdate ? "Add the employee's schools and qualifications, such as high school and college." : undefined}
        />
      </CardContent>
    </Card>
  );
}
