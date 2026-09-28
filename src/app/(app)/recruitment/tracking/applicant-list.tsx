"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/status-badge";
import { daysSince, describeApplied, stageTone } from "@/domains/recruitment/pipeline";
import { ApplicantAvatar, type ApplicantCardData, type StageInfo } from "./applicant-card";

const BADGE_TONE = { open: "info", success: "success", closed: "neutral" } as const;

/** The same applicants as the board, one row each: easier to scan and compare than columns. */
export function ApplicantList({
  applicants,
  stages,
  now,
  onOpen,
}: {
  applicants: ApplicantCardData[];
  stages: StageInfo[];
  now: Date;
  onOpen: (applicant: ApplicantCardData) => void;
}) {
  const stageByCode = new Map(stages.map((stage) => [stage.code, stage]));
  const stageOrder = new Map(stages.map((stage, index) => [stage.code, index]));
  const rows = [...applicants].sort(
    (a, b) => (stageOrder.get(a.stage) ?? 99) - (stageOrder.get(b.stage) ?? 99) || new Date(b.appliedDate).getTime() - new Date(a.appliedDate).getTime(),
  );

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-soft)]">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">Applicant</TableHead>
            <TableHead className="px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">Position</TableHead>
            <TableHead className="px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">Stage</TableHead>
            <TableHead className="px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">Applied</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                No applicants match.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((applicant) => {
              const stage = stageByCode.get(applicant.stage);
              return (
                <TableRow key={applicant._id} className="relative">
                  <TableCell className="px-3">
                    <div className="flex items-center gap-2.5">
                      <ApplicantAvatar name={applicant.applicantName} />
                      <div className="flex min-w-0 flex-col">
                        <button
                          type="button"
                          onClick={() => onOpen(applicant)}
                          aria-label={`Open ${applicant.applicantName}`}
                          className="cursor-pointer truncate text-left font-medium after:absolute after:inset-0 hover:text-primary focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
                        >
                          {applicant.applicantName}
                        </button>
                        <span className="truncate text-xs text-muted-foreground">{applicant.email ?? applicant.phone ?? "No contact on file"}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="px-3">{applicant.positionTitle}</TableCell>
                  <TableCell className="px-3">
                    <StatusBadge status={applicant.stage} label={stage?.name ?? applicant.stage} tone={stage ? BADGE_TONE[stageTone(stage)] : "neutral"} />
                  </TableCell>
                  <TableCell className="px-3">
                    <span className="flex flex-col">
                      <span className="tabular-nums">{new Date(applicant.appliedDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</span>
                      <span className="text-xs text-muted-foreground">{describeApplied(daysSince(applicant.appliedDate, now))}</span>
                    </span>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
