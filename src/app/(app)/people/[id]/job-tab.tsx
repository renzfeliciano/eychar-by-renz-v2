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
};

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
              <CardDescription>Hire, regularization and contract renewals, newest first</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="relative flex flex-col gap-5 border-l pl-6">
                {[...employment.changes].reverse().map((change, index) => (
                  <li key={`${new Date(change.effectiveFrom).toISOString()}-${index}`} className="relative">
                    <span
                      className={cn("absolute top-1 -left-[1.95rem] size-3 rounded-full border-2 border-card", index === 0 ? "bg-primary ring-3 ring-primary/20" : "bg-muted-foreground/40")}
                      aria-hidden="true"
                    />
                    <p className="text-xs text-muted-foreground tabular-nums">
                      From {formatDate(change.effectiveFrom)}
                      {index === 0 && <span className="ml-2 font-medium text-primary">Current</span>}
                    </p>
                    <p className="mt-0.5 font-medium">{change.type === change.previousType ? `${change.type}, contract renewed` : `${change.previousType} to ${change.type}`}</p>
                    <p className="text-sm text-muted-foreground">
                      {[change.endOfContract ? `Contract ends ${formatDate(change.endOfContract)}` : null, change.changedBy ? `Recorded by ${change.changedBy}` : null].filter(Boolean).join(" · ") ||
                        "No end of contract"}
                    </p>
                    {change.note && <p className="mt-1 text-sm whitespace-pre-line">{change.note}</p>}
                  </li>
                ))}
                <li className="relative">
                  <span
                    className={cn(
                      "absolute top-1 -left-[1.95rem] size-3 rounded-full border-2 border-card",
                      employment.changes.length === 0 ? "bg-primary ring-3 ring-primary/20" : "bg-muted-foreground/40",
                    )}
                    aria-hidden="true"
                  />
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
