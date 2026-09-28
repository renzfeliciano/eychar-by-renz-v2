"use client";

import { useState } from "react";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { StageColumn } from "./stage-column";
import { ApplicantCardOverlay, type ApplicantCardData, type StageInfo } from "./applicant-card";

export function KanbanBoard({
  stages,
  applicants,
  canUpdate,
  now,
  onOpen,
  onMove,
}: {
  stages: StageInfo[];
  applicants: ApplicantCardData[];
  canUpdate: boolean;
  now: Date;
  onOpen: (applicant: ApplicantCardData) => void;
  onMove: (applicant: ApplicantCardData, stage: string) => void;
}) {
  const [activeApplicant, setActiveApplicant] = useState<ApplicantCardData | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  function handleDragStart(event: DragStartEvent) {
    setActiveApplicant(applicants.find((applicant) => applicant._id === event.active.id) ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveApplicant(null);
    const { active, over } = event;
    if (!over) return;
    const applicant = applicants.find((item) => item._id === active.id);
    const nextStage = String(over.id);
    if (!applicant || applicant.stage === nextStage) return;
    onMove(applicant, nextStage);
  }

  // A fixed id: dnd-kit's generated one differs between the server and
  // client render, which React reports as a hydration mismatch.
  return (
    <DndContext id="applicant-board" sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setActiveApplicant(null)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:overflow-x-auto sm:pb-3">
        {stages.map((stage) => (
          <StageColumn
            key={stage.code}
            stage={stage}
            stages={stages}
            applicants={applicants.filter((applicant) => applicant.stage === stage.code)}
            canUpdate={canUpdate}
            now={now}
            totalInView={applicants.length}
            onOpen={onOpen}
            onMove={onMove}
          />
        ))}
      </div>
      {/* Explicit zIndex: the sidebar/topbar sit above ordinary content, and
          this portal-rendered overlay otherwise has no z-index of its own
          to out-rank them when a card is dragged near the edges. */}
      <DragOverlay zIndex={1200}>{activeApplicant ? <ApplicantCardOverlay applicant={activeApplicant} /> : null}</DragOverlay>
    </DndContext>
  );
}
