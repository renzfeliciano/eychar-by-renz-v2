import type { Types } from "mongoose";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { TransferForm } from "./transfer-form";
import { formatDate } from "./profile-format";

export type EmploymentTermsView = {
  hiredOn: Date;
  /** The type the employee was hired as. */
  firstType: string;
  changes: {
    effectiveFrom: Date;
    type: string;
    previousType: string;
    endOfContract: Date | null;
    note: string | null;
    changedBy: string | null;
  }[];
  /** Probation evaluations recorded as sent or completed outside EychAr (ADR-053). */
  evaluations: { outcome: "sent" | "completed"; actionDate: Date; sentTo: string | null; remarks: string | null; recordedBy: string | null }[];
};

type TermsEntry =
  { kind: "change"; date: Date; change: EmploymentTermsView["changes"][number]; current: boolean } | { kind: "evaluation"; date: Date; evaluation: EmploymentTermsView["evaluations"][number] };

/** Changes and evaluation notes in one timeline, newest first; the latest change is the current terms. */
function termsTimeline(employment: EmploymentTermsView): TermsEntry[] {
  const changes = employment.changes.map((change, index): TermsEntry => ({ kind: "change", date: new Date(change.effectiveFrom), change, current: index === employment.changes.length - 1 }));
  const evaluations = employment.evaluations.map((evaluation): TermsEntry => ({ kind: "evaluation", date: new Date(evaluation.actionDate), evaluation }));
  return [...changes, ...evaluations].sort((a, b) => b.date.getTime() - a.date.getTime());
}

const Dot = ({ current }: { current: boolean }) => (
  <span className={cn("absolute top-1 -left-[1.95rem] size-3 rounded-full border-2 border-card", current ? "bg-primary ring-3 ring-primary/20" : "bg-muted-foreground/40")} aria-hidden="true" />
);

/** The Job & history tab: employment terms (hire, regularization, renewals), every assignment change, and the transfer form. */
export function JobTab({
  organizationId,
  employeeId,
  assignmentHistory,
  employment,
  positionTitleById,
  projectNameById,
  canUpdate,
  positionOptions,
  projectOptions,
  currentPositionId,
  currentProjectId,
}: {
  organizationId: string;
  employeeId: string;
  assignmentHistory: {
    _id: Types.ObjectId;
    effectiveFrom: Date;
    effectiveTo?: Date | null;
    positionId?: Types.ObjectId | null;
    projectId?: Types.ObjectId | null;
  }[];
  employment?: EmploymentTermsView | null;
  positionTitleById: Map<string, string>;
  projectNameById: Map<string, string>;
  canUpdate: boolean;
  positionOptions: { id: string; label: string }[];
  projectOptions: { id: string; label: string }[];
  currentPositionId?: string;
  currentProjectId?: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex min-w-0 flex-col gap-4">
        {employment && (
          <Card data-testid="employment-terms">
            <CardHeader>
              <CardTitle>Employment terms</CardTitle>
              <CardDescription>Hire, regularization, contract renewals and probation evaluations, newest first</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="relative flex flex-col gap-5 border-l pl-6">
                {termsTimeline(employment).map((entry, index) =>
                  entry.kind === "change" ? (
                    <li key={`change-${index}`} className="relative">
                      <Dot current={entry.current} />
                      <p className="text-xs text-muted-foreground tabular-nums">
                        From {formatDate(entry.date)}
                        {entry.current && <span className="ml-2 font-medium text-primary">Current</span>}
                      </p>
                      <p className="mt-0.5 font-medium">
                        {entry.change.type === entry.change.previousType ? `${entry.change.type}, contract renewed` : `${entry.change.previousType} to ${entry.change.type}`}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {[
                          entry.change.endOfContract ? `Contract ends ${formatDate(entry.change.endOfContract)}` : "No end of contract",
                          entry.change.changedBy ? `Recorded by ${entry.change.changedBy}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {entry.change.note && <p className="mt-1 text-sm whitespace-pre-line">{entry.change.note}</p>}
                    </li>
                  ) : (
                    <li key={`evaluation-${index}`} className="relative">
                      <Dot current={false} />
                      <p className="text-xs text-muted-foreground tabular-nums">{formatDate(entry.date)}</p>
                      <p className="mt-0.5 font-medium">
                        {entry.evaluation.outcome === "sent" ? `Probation evaluation sent${entry.evaluation.sentTo ? ` to ${entry.evaluation.sentTo}` : ""}` : "Probation evaluation completed"}
                      </p>
                      {entry.evaluation.recordedBy && <p className="text-sm text-muted-foreground">Recorded by {entry.evaluation.recordedBy}</p>}
                      {entry.evaluation.remarks && <p className="mt-1 text-sm whitespace-pre-line">{entry.evaluation.remarks}</p>}
                    </li>
                  ),
                )}
                <li className="relative">
                  <Dot current={employment.changes.length === 0} />
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {formatDate(employment.hiredOn)}
                    {employment.changes.length === 0 && <span className="ml-2 font-medium text-primary">Current</span>}
                  </p>
                  <p className="mt-0.5 font-medium">Hired as {employment.firstType}</p>
                </li>
              </ol>
            </CardContent>
          </Card>
        )}
        <Card className="self-start w-full">
          <CardHeader>
            <CardTitle>Assignment history</CardTitle>
            <CardDescription>Every position, project and manager change, newest first</CardDescription>
          </CardHeader>
          <CardContent>
            {assignmentHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">No assignment history yet.</p>
            ) : (
              <ol className="relative flex flex-col gap-5 border-l pl-6">
                {[...assignmentHistory]
                  .sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime())
                  .map((row) => {
                    const current = !row.effectiveTo;
                    return (
                      <li key={row._id.toString()} className="relative">
                        <span
                          className={cn("absolute top-1 -left-[1.95rem] size-3 rounded-full border-2 border-card", current ? "bg-primary ring-3 ring-primary/20" : "bg-muted-foreground/40")}
                          aria-hidden="true"
                        />
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {formatDate(row.effectiveFrom)} – {current ? "Present" : formatDate(row.effectiveTo)}
                          {current && <span className="ml-2 font-medium text-primary">Current</span>}
                        </p>
                        <p className="mt-0.5 font-medium">{row.positionId ? (positionTitleById.get(row.positionId.toString()) ?? "Unknown position") : "No position"}</p>
                        <p className="text-sm text-muted-foreground">{row.projectId ? (projectNameById.get(row.projectId.toString()) ?? "Unknown project") : "No project"}</p>
                      </li>
                    );
                  })}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
      {canUpdate && (
        <TransferForm
          employeeId={employeeId}
          organizationId={organizationId}
          positions={positionOptions}
          projects={projectOptions}
          currentPositionId={currentPositionId}
          currentProjectId={currentProjectId}
        />
      )}
    </div>
  );
}
