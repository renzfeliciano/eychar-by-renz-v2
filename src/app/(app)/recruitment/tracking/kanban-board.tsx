"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { SelectOption } from "@/components/shared/option-select";
import { StageColumn } from "./stage-column";
import { ApplicantCardOverlay } from "./applicant-card";
import type { ApplicantCardData, StageInfo } from "./applicant-card";

export function KanbanBoard({
  organizationId,
  stages,
  applicants,
  positions,
  canUpdate,
}: {
  organizationId: string;
  stages: StageInfo[];
  applicants: ApplicantCardData[];
  positions: SelectOption[];
  canUpdate: boolean;
}) {
  const router = useRouter();
  const [activeApplicant, setActiveApplicant] = useState<ApplicantCardData | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveApplicant(applicants.find((applicant) => applicant._id === event.active.id) ?? null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveApplicant(null);
    const { active, over } = event;
    if (!over) return;
    const applicant = applicants.find((item) => item._id === active.id);
    const nextStage = String(over.id);
    if (!applicant || applicant.stage === nextStage) return;

    const response = await fetch(`/api/applicants/${applicant._id}/stage`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, stage: nextStage }),
    });
    if (response.ok) router.refresh();
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setActiveApplicant(null)}>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {stages.map((stage) => (
          <StageColumn
            key={stage.code}
            organizationId={organizationId}
            stage={stage}
            stages={stages}
            applicants={applicants.filter((applicant) => applicant.stage === stage.code)}
            positions={positions}
            canUpdate={canUpdate}
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
