"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Columns3, List, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { SelectOption } from "@/components/shared/option-select";
import { filterComplaints } from "@/domains/complaints/pipeline";
import { hasSectionData } from "@/domains/complaints/stage-sections";
import { cn } from "@/lib/utils";
import { KanbanBoard } from "./kanban-board";
import { ComplaintList } from "./complaint-list";
import { ComplaintSheet } from "./complaint-sheet";
import { StageDetailsDialog, type SectionValues } from "./stage-details-dialog";
import type { ComplaintCardData, StageInfo } from "./complaint-card";

type View = "board" | "list";

/**
 * The complaints workspace: a search box, a board or list view of the same complaints,
 * and the details panel. Stage moves update the screen immediately and roll back if
 * the server refuses.
 */
export function ComplaintPipeline({
  organizationId,
  stages,
  complaints,
  employees,
  projects,
  canUpdate,
}: {
  organizationId: string;
  stages: StageInfo[];
  complaints: ComplaintCardData[];
  employees: SelectOption[];
  projects: SelectOption[];
  canUpdate: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("board");
  const [openId, setOpenId] = useState<string | null>(null);
  const [pendingStage, setPendingStage] = useState<Record<string, string>>({});
  // A move that is waiting on its stage's details form; the card does not move until the form answers.
  const [stageForm, setStageForm] = useState<{ complaint: ComplaintCardData; stage: string } | null>(null);

  // Fresh server data replaces any optimistic moves.
  const [syncedComplaints, setSyncedComplaints] = useState(complaints);
  if (syncedComplaints !== complaints) {
    setSyncedComplaints(complaints);
    setPendingStage({});
  }

  const current = complaints.map((complaint) => (pendingStage[complaint._id] ? { ...complaint, stage: pendingStage[complaint._id] } : complaint));
  const visible = filterComplaints(current, { query });
  const openComplaint = current.find((complaint) => complaint._id === openId) ?? null;
  const isFiltered = Boolean(query.trim());

  const stageName = (code: string) => stages.find((item) => item.code === code)?.name ?? code;

  /**
   * Every way of moving a card (drag, "Move to", the panel) comes here. A stage with details to
   * record (every stage but the first, whose details are the incident fields) asks for them first
   * unless they are already filled in; the others move at once.
   */
  function requestMove(complaint: ComplaintCardData, stage: string) {
    if (complaint.stage === stage) return;
    const asksForDetails = canUpdate && stage !== stages[0]?.code && !hasSectionData(complaint.stageDetails?.[stage]);
    if (asksForDetails) setStageForm({ complaint, stage });
    else void move(complaint, stage);
  }

  /** The move that came from the details form: not optimistic, since the form can still be refused. Resolves to an error message, or null. */
  async function moveWithDetails(complaint: ComplaintCardData, stage: string, details?: SectionValues): Promise<string | null> {
    const response = await fetch(`/api/complaints/${complaint._id}/stage`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, stage, ...(details ? { details } : {}) }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      return body.error ?? `Couldn't move ${complaint.irNumber}. Please try again.`;
    }
    setPendingStage((state) => ({ ...state, [complaint._id]: stage }));
    toast.success(`${complaint.irNumber} moved to ${stageName(stage)}`);
    router.refresh();
    return null;
  }

  async function saveDetails(complaint: ComplaintCardData, stage: string, values: SectionValues): Promise<string | null> {
    const response = await fetch(`/api/complaints/${complaint._id}/details`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, stage, details: values }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      return body.error ?? "Couldn't save the details. Please try again.";
    }
    toast.success("Details saved");
    router.refresh();
    return null;
  }

  async function move(complaint: ComplaintCardData, stage: string) {
    if (complaint.stage === stage) return;
    setPendingStage((state) => ({ ...state, [complaint._id]: stage }));
    const response = await fetch(`/api/complaints/${complaint._id}/stage`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, stage }),
    });
    if (!response.ok) {
      setPendingStage((state) => {
        const next = { ...state };
        delete next[complaint._id];
        return next;
      });
      const body = await response.json().catch(() => ({}));
      toast.error(body.error ?? `Couldn't move ${complaint.irNumber}. Please try again.`);
      return;
    }
    toast.success(`${complaint.irNumber} moved to ${stageName(stage)}`);
    router.refresh();
  }

  const shown = isFiltered ? visible.length : current.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search IR number or respondent" aria-label="Search complaints" className="pl-9" />
        </div>
        {isFiltered && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="flex h-8 cursor-pointer items-center gap-1 rounded-md px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" aria-hidden="true" />
            Clear
          </button>
        )}

        <span className="text-sm text-muted-foreground tabular-nums sm:ml-auto" aria-live="polite">
          {isFiltered ? `${visible.length} of ${current.length}` : current.length} complaint{shown === 1 ? "" : "s"}
        </span>
        <div role="radiogroup" aria-label="View" className="flex rounded-lg border bg-muted/40 p-0.5">
          {(
            [
              ["board", "Board", Columns3],
              ["list", "List", List],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={view === value}
              onClick={() => setView(value)}
              className={cn(
                "flex h-7 max-md:h-10 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-muted-foreground transition-[color,background-color,box-shadow] duration-150 hover:text-foreground",
                view === value && "bg-card text-foreground shadow-[0_1px_2px_oklch(0.235_0.028_262/10%)] ring-1 ring-border",
              )}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {view === "board" ? (
        <KanbanBoard stages={stages} complaints={visible} canUpdate={canUpdate} onOpen={(complaint) => setOpenId(complaint._id)} onMove={requestMove} />
      ) : (
        <ComplaintList complaints={visible} stages={stages} onOpen={(complaint) => setOpenId(complaint._id)} />
      )}

      <ComplaintSheet
        complaint={openComplaint}
        stages={stages}
        employees={employees}
        projects={projects}
        organizationId={organizationId}
        canUpdate={canUpdate}
        onClose={() => setOpenId(null)}
        onMove={requestMove}
        onSaveDetails={saveDetails}
      />

      <StageDetailsDialog
        open={stageForm !== null}
        onOpenChange={(open) => !open && setStageForm(null)}
        stageCode={stageForm?.stage ?? ""}
        title={stageForm ? `Move ${stageForm.complaint.irNumber} to ${stageName(stageForm.stage)}` : ""}
        description="Record this stage's details now, or move the complaint without them and fill them in later from its details panel."
        initial={undefined}
        saveLabel="Save and move"
        savePendingLabel="Moving…"
        skip={stageForm ? { label: "Move without details", pendingLabel: "Moving…", onSkip: () => moveWithDetails(stageForm.complaint, stageForm.stage) } : undefined}
        onSave={(values) => moveWithDetails(stageForm!.complaint, stageForm!.stage, values)}
      />
    </div>
  );
}
