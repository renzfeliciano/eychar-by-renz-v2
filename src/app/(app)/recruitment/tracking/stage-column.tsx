import { ApplicantCard, type ApplicantCardData, type StageInfo, type AssignmentOptions } from "./applicant-card";

export function StageColumn({
  organizationId,
  stage,
  stages,
  applicants,
  canUpdate,
  canHire,
  assignmentOptions,
}: {
  organizationId: string;
  stage: StageInfo;
  stages: StageInfo[];
  applicants: ApplicantCardData[];
  canUpdate: boolean;
  canHire: boolean;
  assignmentOptions: AssignmentOptions;
}) {
  return (
    <div className="flex w-72 shrink-0 flex-col gap-3 rounded-xl border bg-muted/30 p-3" data-testid={`tracking-column-${stage.code}`}>
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold">{stage.name}</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{applicants.length}</span>
      </div>
      <div className="flex flex-col gap-2">
        {applicants.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">No applicants</p>
        ) : (
          applicants.map((applicant) => (
            <ApplicantCard
              key={applicant._id}
              organizationId={organizationId}
              applicant={applicant}
              stages={stages}
              canUpdate={canUpdate}
              canHire={canHire}
              assignmentOptions={assignmentOptions}
            />
          ))
        )}
      </div>
    </div>
  );
}
