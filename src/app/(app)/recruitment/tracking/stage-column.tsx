"use client";

import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { ApplicantCard, type ApplicantCardData, type StageInfo } from "./applicant-card";
import type { SelectOption } from "@/components/shared/option-select";

export function StageColumn({
  organizationId,
  stage,
  stages,
  applicants,
  positions,
  canUpdate,
}: {
  organizationId: string;
  stage: StageInfo;
  stages: StageInfo[];
  applicants: ApplicantCardData[];
  positions: SelectOption[];
  canUpdate: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.code });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-full flex-col gap-3 rounded-xl border bg-muted/30 p-3 transition-colors sm:w-72 sm:shrink-0",
        isOver && "border-primary bg-primary/5",
      )}
      role="group"
      aria-label={`${stage.name}, ${applicants.length} applicant${applicants.length === 1 ? "" : "s"}`}
      data-testid={`tracking-column-${stage.code}`}
    >
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
              positions={positions}
              canUpdate={canUpdate}
            />
          ))
        )}
      </div>
    </div>
  );
}
