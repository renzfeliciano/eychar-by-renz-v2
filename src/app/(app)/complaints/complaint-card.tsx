"use client";

import { useDraggable } from "@dnd-kit/core";
import { ArrowRightLeft, CalendarDays, GripVertical, MoreHorizontal, StickyNote } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { summarizeSection } from "@/domains/complaints/stage-sections";
import { cn } from "@/lib/utils";

export type StageInfo = { code: string; name: string; isTerminal?: boolean; description?: string };
export type ComplaintCardData = {
  _id: string;
  irNumber: string;
  employeeId: string;
  /** The respondent's name, or "—" when their employee record is gone. */
  respondentName: string;
  stage: string;
  receivedDate: string;
  remarks?: string | null;
  // Incident details; all optional, and absent on complaints made before they existed.
  /** The project (or site) the incident happened at: its id, and its name resolved on the server. */
  projectId?: string | null;
  projectName?: string | null;
  description?: string | null;
  what?: string | null;
  where?: string | null;
  incidentDate?: string | null;
  complainantName?: string | null;
  /** One section per stage code (dates as ISO text), only those with something recorded. */
  stageDetails?: Record<string, Record<string, string>>;
};

/** Calendar days are stored at UTC midnight, so they are shown in UTC. */
export function formatReceived(value: string, month: "short" | "long" = "short"): string {
  return new Date(value).toLocaleDateString("en-US", { month, day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function RespondentAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[0.7rem] font-semibold text-secondary-foreground ring-1 ring-border", className)} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

/**
 * One complaint on the board. The respondent's name opens the details panel, the grip
 * drags the card to another column, and the actions menu moves it without dragging
 * (keyboard and touch friendly). All three use the same stage move.
 */
export function ComplaintCard({
  complaint,
  stages,
  canUpdate,
  onOpen,
  onMove,
}: {
  complaint: ComplaintCardData;
  stages: StageInfo[];
  canUpdate: boolean;
  onOpen: () => void;
  onMove: (stage: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: complaint._id, disabled: !canUpdate });
  // What was recorded at the stage the card is in, for example "Dec 3, 2026 · Virtual" for a hearing.
  const summary = summarizeSection(complaint.stage, complaint.stageDetails?.[complaint.stage]);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative rounded-lg border bg-card p-3 shadow-[var(--shadow-soft)] transition-[border-color,box-shadow,opacity] duration-150 hover:border-primary/30 hover:shadow-[var(--shadow-raised)]",
        isDragging && "opacity-40",
      )}
      data-testid="complaint-card"
    >
      <div className="flex items-start gap-2.5">
        <RespondentAvatar name={complaint.respondentName} />
        <div className="min-w-0 flex-1">
          {/* The button's ::after covers the card, so the whole card opens the panel. */}
          <button
            type="button"
            onClick={onOpen}
            aria-label={`Open ${complaint.irNumber}`}
            className="block max-w-full cursor-pointer truncate text-left text-sm font-medium after:absolute after:inset-0 after:rounded-lg hover:text-primary focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
          >
            {complaint.respondentName}
          </button>
          <p className="truncate text-xs text-muted-foreground">{complaint.irNumber}</p>
          {complaint.projectName && <p className="truncate text-xs text-muted-foreground">{complaint.projectName}</p>}
        </div>
        {canUpdate && (
          <div className="relative z-10 -mt-1 -mr-1 flex items-center">
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={`Actions for ${complaint.irNumber}`}
                className="flex size-7 max-md:size-10 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                data-testid={`move-complaint-${complaint._id}`}
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
                    .filter((stage) => stage.code !== complaint.stage)
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
              aria-label={`Drag ${complaint.irNumber}'s card to another stage`}
              data-testid={`drag-complaint-${complaint._id}`}
              {...attributes}
              {...listeners}
            >
              <GripVertical className="size-3.5" />
            </button>
          </div>
        )}
      </div>

      <div className="mt-2.5 flex items-center gap-2 border-t pt-2 text-xs text-muted-foreground">
        {summary ? (
          <span className="flex flex-1 items-center gap-1.5 truncate">
            <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{summary}</span>
          </span>
        ) : (
          <span className="flex-1 truncate">Received {formatReceived(complaint.receivedDate)}</span>
        )}
        {complaint.remarks && <StickyNote className="size-3.5 shrink-0" aria-label="Has remarks" />}
      </div>
    </div>
  );
}

/**
 * Rendered inside dnd-kit's `DragOverlay` while a drag is in progress, a non-interactive
 * snapshot portalled to the document body, so it floats above every column instead of
 * being clipped by a column's scroll area.
 */
export function ComplaintCardOverlay({ complaint }: { complaint: ComplaintCardData }) {
  return (
    <div className="w-68 rotate-2 rounded-lg border bg-card p-3 shadow-[var(--shadow-modal)]">
      <div className="flex items-start gap-2.5">
        <RespondentAvatar name={complaint.respondentName} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{complaint.respondentName}</p>
          <p className="truncate text-xs text-muted-foreground">{complaint.irNumber}</p>
        </div>
      </div>
    </div>
  );
}
