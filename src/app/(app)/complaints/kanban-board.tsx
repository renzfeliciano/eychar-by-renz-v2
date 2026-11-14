"use client";

import { useState } from "react";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { StageColumn } from "./stage-column";
import { ComplaintCardOverlay, type ComplaintCardData, type StageInfo } from "./complaint-card";

export function KanbanBoard({
  stages,
  complaints,
  canUpdate,
  onOpen,
  onMove,
}: {
  stages: StageInfo[];
  complaints: ComplaintCardData[];
  canUpdate: boolean;
  onOpen: (complaint: ComplaintCardData) => void;
  onMove: (complaint: ComplaintCardData, stage: string) => void;
}) {
  const [activeComplaint, setActiveComplaint] = useState<ComplaintCardData | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  function handleDragStart(event: DragStartEvent) {
    setActiveComplaint(complaints.find((complaint) => complaint._id === event.active.id) ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveComplaint(null);
    const { active, over } = event;
    if (!over) return;
    const complaint = complaints.find((item) => item._id === active.id);
    const nextStage = String(over.id);
    if (!complaint || complaint.stage === nextStage) return;
    onMove(complaint, nextStage);
  }

  // A fixed id: dnd-kit's generated one differs between the server and
  // client render, which React reports as a hydration mismatch.
  return (
    <DndContext id="complaint-board" sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setActiveComplaint(null)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:overflow-x-auto sm:pb-3">
        {stages.map((stage) => (
          <StageColumn
            key={stage.code}
            stage={stage}
            stages={stages}
            complaints={complaints.filter((complaint) => complaint.stage === stage.code)}
            canUpdate={canUpdate}
            totalInView={complaints.length}
            onOpen={onOpen}
            onMove={onMove}
          />
        ))}
      </div>
      {/* Explicit zIndex: the sidebar/topbar sit above ordinary content, and
          this portal-rendered overlay otherwise has no z-index of its own
          to out-rank them when a card is dragged near the edges. */}
      <DragOverlay zIndex={1200}>{activeComplaint ? <ComplaintCardOverlay complaint={activeComplaint} /> : null}</DragOverlay>
    </DndContext>
  );
}
