"use client";

import { TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataTableFrame } from "@/components/shared/data-table-frame";
import { StatusBadge } from "@/components/shared/status-badge";
import { RespondentAvatar, formatReceived, type ComplaintCardData, type StageInfo } from "./complaint-card";

/** The same complaints as the board, one row each: easier to scan and compare than columns. */
export function ComplaintList({
  complaints,
  stages,
  onOpen,
}: {
  complaints: ComplaintCardData[];
  stages: StageInfo[];
  onOpen: (complaint: ComplaintCardData) => void;
}) {
  const stageByCode = new Map(stages.map((stage) => [stage.code, stage]));
  const stageOrder = new Map(stages.map((stage, index) => [stage.code, index]));
  const rows = [...complaints].sort(
    (a, b) => (stageOrder.get(a.stage) ?? 99) - (stageOrder.get(b.stage) ?? 99) || new Date(b.receivedDate).getTime() - new Date(a.receivedDate).getTime(),
  );

  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-[var(--shadow-soft)]">
      <DataTableFrame
        testId="complaint-list"
        head={
          <TableHeader className="sticky top-0 z-20 [&_th]:bg-muted">
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-3 text-xs font-medium text-muted-foreground md:w-full">Respondent</TableHead>
              <TableHead className="px-3 text-xs font-medium text-muted-foreground">IR number</TableHead>
              <TableHead className="px-3 text-xs font-medium text-muted-foreground">Project/Site</TableHead>
              <TableHead className="px-3 text-xs font-medium text-muted-foreground">Complainant</TableHead>
              <TableHead className="px-3 text-xs font-medium text-muted-foreground">Stage</TableHead>
              <TableHead className="px-3 text-xs font-medium text-muted-foreground">Received</TableHead>
            </TableRow>
          </TableHeader>
        }
        rows={
          rows.length === 0
            ? [
                <TableRow key="empty">
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    No complaints match.
                  </TableCell>
                </TableRow>,
              ]
            : rows.map((complaint) => {
                const stage = stageByCode.get(complaint.stage);
                return (
                  <TableRow key={complaint._id} className="relative">
                    <TableCell className="px-3">
                      <div className="flex items-center gap-2.5">
                        <RespondentAvatar name={complaint.respondentName} />
                        <button
                          type="button"
                          onClick={() => onOpen(complaint)}
                          aria-label={`Open ${complaint.irNumber}`}
                          className="cursor-pointer truncate text-left font-medium after:absolute after:inset-0 hover:text-primary focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
                        >
                          {complaint.respondentName}
                        </button>
                      </div>
                    </TableCell>
                    <TableCell className="px-3 tabular-nums">{complaint.irNumber}</TableCell>
                    <TableCell className="px-3">{complaint.projectName || "—"}</TableCell>
                    <TableCell className="px-3">{complaint.complainantName || "—"}</TableCell>
                    <TableCell className="px-3">
                      <StatusBadge status={complaint.stage} label={stage?.name ?? complaint.stage} tone={stage?.isTerminal ? "neutral" : "info"} />
                    </TableCell>
                    <TableCell className="px-3 tabular-nums">{formatReceived(complaint.receivedDate)}</TableCell>
                  </TableRow>
                );
              })
        }
      />
    </div>
  );
}
