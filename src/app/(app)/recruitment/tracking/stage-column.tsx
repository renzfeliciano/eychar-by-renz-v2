"use client";

import { useDroppable } from "@dnd-kit/core";
import { stageTone } from "@/domains/recruitment/pipeline";
import { cn } from "@/lib/utils";
import { ApplicantCard, type ApplicantCardData, type StageInfo } from "./applicant-card";

const TONE_DOT = { open: "bg-primary", success: "bg-success", closed: "bg-muted-foreground" } as const;

export function StageColumn({
  stage,
  stages,
  applicants,
  canUpdate,
  now,
  totalInView,
  onOpen,
  onMove,
}: {
  stage: StageInfo;
  stages: StageInfo[];
  applicants: ApplicantCardData[];
  canUpdate: boolean;
  now: Date;
  /** Everyone on the board after filtering, for the column's share. */
  totalInView: number;
  onOpen: (applicant: ApplicantCardData) => void;
  onMove: (applicant: ApplicantCardData, stage: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.code });
  const tone = stageTone(stage);
  const share = totalInView ? Math.round((applicants.length / totalInView) * 100) : 0;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-full flex-col rounded-xl border bg-muted/40 transition-[background-color,border-color] duration-150 sm:w-72 sm:shrink-0",
        tone === "closed" && "bg-muted/20",
        isOver && "border-primary/60 bg-primary/5",
      )}
      role="group"
      aria-label={`${stage.name}, ${applicants.length} applicant${applicants.length === 1 ? "" : "s"}`}
      data-testid={`tracking-column-${stage.code}`}
    >
      <div className="flex flex-col gap-2 border-b px-3 pt-3 pb-2.5">
        <div className="flex items-center gap-2">
          <span className={cn("size-2 shrink-0 rounded-full", TONE_DOT[tone])} aria-hidden="true" />
          <h2 className="flex-1 truncate text-sm font-semibold">{stage.name}</h2>
          <span className="rounded-md bg-background px-1.5 py-0.5 text-xs font-semibold tabular-nums ring-1 ring-border">{applicants.length}</span>
        </div>
        {/* This column's share of the board: where the pipeline is thick or thin, at a glance. */}
        <div className="h-1 overflow-hidden rounded-full bg-border/70" aria-hidden="true">
          <div className={cn("h-full rounded-full transition-[width] duration-300", TONE_DOT[tone])} style={{ width: `${share}%` }} />
        </div>
      </div>
      <div className="flex max-h-[calc(100dvh-22rem)] min-h-28 flex-col gap-2 overflow-y-auto p-2.5">
        {applicants.length === 0 ? (
          <p
            className={cn(
              "flex flex-1 items-center justify-center rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground",
              isOver && "border-primary/50 text-primary",
            )}
          >
            {canUpdate ? "Drop an applicant here" : "No applicants"}
          </p>
        ) : (
          applicants.map((applicant) => (
            <ApplicantCard
              key={applicant._id}
              applicant={applicant}
              stages={stages}
              canUpdate={canUpdate}
              now={now}
              onOpen={() => onOpen(applicant)}
              onMove={(next) => onMove(applicant, next)}
            />
          ))
        )}
      </div>
    </div>
  );
}
