"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDraggable } from "@dnd-kit/core";
import { GripVertical } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { OptionSelect, type SelectOption } from "@/components/shared/option-select";
import { cn } from "@/lib/utils";
import { ApplicantFormDialog } from "./applicant-form-dialog";

export type StageInfo = { code: string; name: string };
export type ApplicantCardData = {
  _id: string;
  positionId: string;
  applicantName: string;
  email?: string | null;
  phone?: string | null;
  stage: string;
  appliedDate: string;
  remarks?: string | null;
  positionTitle: string;
};

async function patchApplicantStage(id: string, organizationId: string, stage: string) {
  return fetch(`/api/applicants/${id}/stage`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ organizationId, stage }),
  });
}

/**
 * Drag the card to another column, or use the "Move to" select — both call
 * the same free-form stage move (any direction, no forward-only
 * restriction), matching the legacy v1 app. Edit opens the same create/edit
 * form dialog used to add an applicant.
 */
export function ApplicantCard({
  organizationId,
  applicant,
  stages,
  positions,
  canUpdate,
}: {
  organizationId: string;
  applicant: ApplicantCardData;
  stages: StageInfo[];
  positions: SelectOption[];
  canUpdate: boolean;
}) {
  const router = useRouter();
  const [isMoving, setIsMoving] = useState(false);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: applicant._id,
    disabled: !canUpdate,
  });

  async function handleMove(stage: string) {
    if (!stage || stage === applicant.stage) return;
    setIsMoving(true);
    const response = await patchApplicantStage(applicant._id, organizationId, stage);
    setIsMoving(false);
    if (response.ok) router.refresh();
  }

  const stageOptions: SelectOption[] = stages.map((stage) => ({ id: stage.code, label: stage.name }));

  return (
    <Card
      ref={setNodeRef}
      className={cn("gap-2 py-3 shadow-[var(--shadow-soft)]", isDragging && "opacity-40")}
      data-testid="tracking-applicant-card"
    >
      <CardContent className="flex flex-col gap-2 px-3">
        <div className="flex items-start gap-1.5">
          {canUpdate && (
            <button
              type="button"
              className="mt-0.5 shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
              aria-label={`Drag ${applicant.applicantName}'s card to another stage`}
              data-testid={`drag-applicant-${applicant._id}`}
              {...attributes}
              {...listeners}
            >
              <GripVertical className="size-3.5" />
            </button>
          )}
          <div>
            <p className="text-sm font-medium">{applicant.applicantName}</p>
            <p className="text-xs text-muted-foreground">{applicant.positionTitle}</p>
            <p className="text-xs text-muted-foreground">Applied {new Date(applicant.appliedDate).toLocaleDateString()}</p>
          </div>
        </div>

        {canUpdate && (
          <div className="flex items-end gap-1.5">
            <OptionSelect
              label="Move to"
              value={applicant.stage}
              onChange={handleMove}
              options={stageOptions}
              placeholder="Stage"
              testId={`move-applicant-${applicant._id}`}
            />
          </div>
        )}
        {canUpdate && (
          <ApplicantFormDialog
            organizationId={organizationId}
            positions={positions}
            initialApplicant={{
              id: applicant._id,
              positionId: applicant.positionId,
              applicantName: applicant.applicantName,
              email: applicant.email,
              phone: applicant.phone,
              appliedDate: applicant.appliedDate,
              remarks: applicant.remarks,
            }}
          />
        )}
        {isMoving && <p className="text-xs text-muted-foreground">Moving…</p>}
      </CardContent>
    </Card>
  );
}

/**
 * Rendered inside dnd-kit's `DragOverlay` while a drag is in progress — a
 * non-interactive snapshot portalled to the document body, so it floats
 * above every column instead of being clipped by a sibling column's
 * overflow/stacking context.
 */
export function ApplicantCardOverlay({ applicant }: { applicant: ApplicantCardData }) {
  return (
    <Card className="gap-2 py-3 shadow-[var(--shadow-glow)]">
      <CardContent className="flex flex-col gap-2 px-3">
        <div className="flex items-start gap-1.5">
          <GripVertical className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">{applicant.applicantName}</p>
            <p className="text-xs text-muted-foreground">{applicant.positionTitle}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
