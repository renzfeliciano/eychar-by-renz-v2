"use client";

import { useDraggable } from "@dnd-kit/core";
import { ArrowRightLeft, GripVertical, Mail, MoreHorizontal, Phone } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { daysSince, describeApplied } from "@/domains/recruitment/pipeline";
import { cn } from "@/lib/utils";

export type StageInfo = { code: string; name: string; isTerminal?: boolean; isHired?: boolean };
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

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function ApplicantAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[0.7rem] font-semibold text-primary", className)} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

/**
 * One applicant on the board. The name opens the details panel, the grip
 * drags the card to another column, and the actions menu moves it without
 * dragging (keyboard and touch friendly). All three use the same stage move.
 */
export function ApplicantCard({
  applicant,
  stages,
  canUpdate,
  now,
  onOpen,
  onMove,
}: {
  applicant: ApplicantCardData;
  stages: StageInfo[];
  canUpdate: boolean;
  now: Date;
  onOpen: () => void;
  onMove: (stage: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: applicant._id, disabled: !canUpdate });
  const days = daysSince(applicant.appliedDate, now);
  const isClosed = Boolean(stages.find((stage) => stage.code === applicant.stage)?.isTerminal);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative rounded-lg border bg-card p-3 shadow-[var(--shadow-soft)] transition-[border-color,box-shadow,opacity] duration-150 hover:border-primary/30 hover:shadow-[var(--shadow-raised)]",
        isDragging && "opacity-40",
      )}
      data-testid="tracking-applicant-card"
    >
      <div className="flex items-start gap-2.5">
        <ApplicantAvatar name={applicant.applicantName} />
        <div className="min-w-0 flex-1">
          {/* The button's ::after covers the card, so the whole card opens the panel. */}
          <button
            type="button"
            onClick={onOpen}
            aria-label={`Open ${applicant.applicantName}`}
            className="block max-w-full cursor-pointer truncate text-left text-sm font-medium after:absolute after:inset-0 after:rounded-lg hover:text-primary focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
          >
            {applicant.applicantName}
          </button>
          <p className="truncate text-xs text-muted-foreground">{applicant.positionTitle}</p>
        </div>
        {canUpdate && (
          <div className="relative z-10 -mt-1 -mr-1 flex items-center">
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={`Actions for ${applicant.applicantName}`}
                className="flex size-7 max-md:size-10 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                data-testid={`move-applicant-${applicant._id}`}
              >
                <MoreHorizontal className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="flex items-center gap-1.5">
                    <ArrowRightLeft className="size-3.5" aria-hidden="true" />
                    Move to
                  </DropdownMenuLabel>
                  {stages
                    .filter((stage) => stage.code !== applicant.stage)
                    .map((stage) => (
                      <DropdownMenuItem key={stage.code} onClick={() => onMove(stage.code)}>
                        {stage.name}
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onOpen}>View details</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              type="button"
              className="flex size-7 max-md:size-10 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground/70 hover:bg-muted hover:text-foreground active:cursor-grabbing"
              aria-label={`Drag ${applicant.applicantName}'s card to another stage`}
              data-testid={`drag-applicant-${applicant._id}`}
              {...attributes}
              {...listeners}
            >
              <GripVertical className="size-3.5" />
            </button>
          </div>
        )}
      </div>

      <div className="mt-2.5 flex items-center gap-2 border-t pt-2 text-xs text-muted-foreground">
        {/* Over a month in an open stage reads as stalled. */}
        <span className={cn("flex-1 truncate", days > 30 && !isClosed && "font-medium text-warning")}>{describeApplied(days)}</span>
        {applicant.email && <Mail className="size-3.5 shrink-0" aria-label="Has email" />}
        {applicant.phone && <Phone className="size-3.5 shrink-0" aria-label="Has phone" />}
      </div>
    </div>
  );
}

/**
 * Rendered inside dnd-kit's `DragOverlay` while a drag is in progress, a
 * non-interactive snapshot portalled to the document body, so it floats
 * above every column instead of being clipped by a column's scroll area.
 */
export function ApplicantCardOverlay({ applicant }: { applicant: ApplicantCardData }) {
  return (
    <div className="w-68 rotate-2 rounded-lg border bg-card p-3 shadow-[var(--shadow-modal)]">
      <div className="flex items-start gap-2.5">
        <ApplicantAvatar name={applicant.applicantName} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{applicant.applicantName}</p>
          <p className="truncate text-xs text-muted-foreground">{applicant.positionTitle}</p>
        </div>
      </div>
    </div>
  );
}
