"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Columns3, List, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SelectOption } from "@/components/shared/option-select";
import { filterApplicants } from "@/domains/recruitment/pipeline";
import { cn } from "@/lib/utils";
import { KanbanBoard } from "./kanban-board";
import { ApplicantList } from "./applicant-list";
import { ApplicantSheet } from "./applicant-sheet";
import type { ApplicantCardData, StageInfo } from "./applicant-card";

const ALL_POSITIONS = "__all__";
type View = "board" | "list";

/**
 * The tracking workspace: search and position filter, a board or list view
 * of the same applicants, and the details panel. Stage moves update the
 * screen immediately and roll back if the server refuses.
 */
export function ApplicantPipeline({
  organizationId,
  stages,
  applicants,
  positions,
  canUpdate,
  nowIso,
}: {
  organizationId: string;
  stages: StageInfo[];
  applicants: ApplicantCardData[];
  positions: SelectOption[];
  canUpdate: boolean;
  /** The server's "now", so relative dates match between server and client render. */
  nowIso?: string;
}) {
  const router = useRouter();
  const now = useMemo(() => (nowIso ? new Date(nowIso) : new Date()), [nowIso]);
  const [query, setQuery] = useState("");
  const [positionId, setPositionId] = useState("");
  const [view, setView] = useState<View>("board");
  const [openId, setOpenId] = useState<string | null>(null);
  const [pendingStage, setPendingStage] = useState<Record<string, string>>({});

  // Fresh server data replaces any optimistic moves.
  const [syncedApplicants, setSyncedApplicants] = useState(applicants);
  if (syncedApplicants !== applicants) {
    setSyncedApplicants(applicants);
    setPendingStage({});
  }

  const current = applicants.map((applicant) => (pendingStage[applicant._id] ? { ...applicant, stage: pendingStage[applicant._id] } : applicant));
  const visible = filterApplicants(current, { query, positionId });
  const openApplicant = current.find((applicant) => applicant._id === openId) ?? null;
  const isFiltered = Boolean(query.trim() || positionId);

  async function move(applicant: ApplicantCardData, stage: string) {
    if (applicant.stage === stage) return;
    setPendingStage((state) => ({ ...state, [applicant._id]: stage }));
    const response = await fetch(`/api/applicants/${applicant._id}/stage`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, stage }),
    });
    if (!response.ok) {
      setPendingStage((state) => {
        const next = { ...state };
        delete next[applicant._id];
        return next;
      });
      const body = await response.json().catch(() => ({}));
      toast.error(body.error ?? `Couldn't move ${applicant.applicantName}. Please try again.`);
      return;
    }
    const stageName = stages.find((item) => item.code === stage)?.name ?? stage;
    toast.success(`${applicant.applicantName} moved to ${stageName}`);
    router.refresh();
  }

  const positionLabel = positionId ? (positions.find((position) => position.id === positionId)?.label ?? "All positions") : "All positions";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email or position" aria-label="Search applicants" className="pl-9" />
        </div>
        <Select value={positionId || ALL_POSITIONS} onValueChange={(next) => setPositionId(!next || next === ALL_POSITIONS ? "" : String(next))}>
          <SelectTrigger className="w-full sm:w-52" aria-label="Filter by position">
            <SelectValue>{positionLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_POSITIONS}>All positions</SelectItem>
            {positions.map((position) => (
              <SelectItem key={position.id} value={position.id}>
                {position.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isFiltered && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setPositionId("");
            }}
            className="flex h-8 cursor-pointer items-center gap-1 rounded-md px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" aria-hidden="true" />
            Clear
          </button>
        )}

        <span className="text-sm text-muted-foreground tabular-nums sm:ml-auto" aria-live="polite">
          {isFiltered ? `${visible.length} of ${current.length}` : current.length} applicant{(isFiltered ? visible.length : current.length) === 1 ? "" : "s"}
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
        <KanbanBoard stages={stages} applicants={visible} canUpdate={canUpdate} now={now} onOpen={(applicant) => setOpenId(applicant._id)} onMove={move} />
      ) : (
        <ApplicantList applicants={visible} stages={stages} now={now} onOpen={(applicant) => setOpenId(applicant._id)} />
      )}

      <ApplicantSheet
        applicant={openApplicant}
        stages={stages}
        positions={positions}
        organizationId={organizationId}
        canUpdate={canUpdate}
        now={now}
        onClose={() => setOpenId(null)}
        onMove={move}
      />
    </div>
  );
}
