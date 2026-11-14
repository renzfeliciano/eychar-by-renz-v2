"use client";

import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { ComplaintCard, type ComplaintCardData, type StageInfo } from "./complaint-card";

export function StageColumn({
  stage,
  stages,
  complaints,
  canUpdate,
  totalInView,
  onOpen,
  onMove,
}: {
  stage: StageInfo;
  stages: StageInfo[];
  complaints: ComplaintCardData[];
  canUpdate: boolean;
  /** Every complaint on the board after filtering, for the column's share. */
  totalInView: number;
  onOpen: (complaint: ComplaintCardData) => void;
  onMove: (complaint: ComplaintCardData, stage: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.code });
  const closed = Boolean(stage.isTerminal);
  const share = totalInView ? Math.round((complaints.length / totalInView) * 100) : 0;
  const tone = closed ? "bg-muted-foreground" : "bg-primary";

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-full flex-col rounded-lg border bg-muted/40 transition-[background-color,border-color] duration-150 sm:w-72 sm:shrink-0",
        closed && "bg-muted/20",
        isOver && "border-primary/60 bg-primary/5",
      )}
      role="group"
      aria-label={`${stage.name}, ${complaints.length} complaint${complaints.length === 1 ? "" : "s"}`}
      data-testid={`complaint-column-${stage.code}`}
    >
      <div className="flex flex-col gap-2 border-b px-3 pt-3 pb-2.5">
        <div className="flex items-center gap-2">
          <span className={cn("size-2 shrink-0 rounded-full", tone)} aria-hidden="true" />
          <h2 className="flex-1 truncate text-sm font-semibold">{stage.name}</h2>
          <span className="rounded-md bg-background px-1.5 py-0.5 text-xs font-semibold tabular-nums ring-1 ring-border">{complaints.length}</span>
        </div>
        {/* This column's share of the board: where complaints pile up, at a glance. */}
        <div className="h-1 overflow-hidden rounded-full bg-border/70" aria-hidden="true">
          <div className={cn("h-full rounded-full transition-[width] duration-300", tone)} style={{ width: `${share}%` }} />
        </div>
      </div>
      <div className="flex max-h-[calc(100dvh-22rem)] min-h-28 flex-col gap-2 overflow-y-auto p-2.5">
        {complaints.length === 0 ? (
          <p
            className={cn(
              "flex flex-1 items-center justify-center rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground",
              isOver && "border-primary/50 text-primary",
            )}
          >
            {canUpdate ? "Drop a complaint here" : "No complaints"}
          </p>
        ) : (
          complaints.map((complaint) => (
            <ComplaintCard key={complaint._id} complaint={complaint} stages={stages} canUpdate={canUpdate} onOpen={() => onOpen(complaint)} onMove={(next) => onMove(complaint, next)} />
          ))
        )}
      </div>
    </div>
  );
}
