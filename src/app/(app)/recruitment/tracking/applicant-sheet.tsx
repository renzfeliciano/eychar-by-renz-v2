"use client";

import { Check, Mail, Phone, CalendarDays, Briefcase, StickyNote } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/shared/status-badge";
import type { SelectOption } from "@/components/shared/option-select";
import { daysSince, describeApplied, stageTone } from "@/domains/recruitment/pipeline";
import { cn } from "@/lib/utils";
import { ApplicantAvatar, type ApplicantCardData, type StageInfo } from "./applicant-card";
import { ApplicantFormDialog } from "./applicant-form-dialog";

const BADGE_TONE = { open: "info", success: "success", closed: "neutral" } as const;

/**
 * The applicant's side panel: who they are, how to reach them, and where
 * they stand. The stage track is also the control: pick a stage to move
 * them there.
 */
export function ApplicantSheet({
  applicant,
  stages,
  positions,
  organizationId,
  canUpdate,
  now,
  onClose,
  onMove,
}: {
  applicant: ApplicantCardData | null;
  stages: StageInfo[];
  positions: SelectOption[];
  organizationId: string;
  canUpdate: boolean;
  now: Date;
  onClose: () => void;
  onMove: (applicant: ApplicantCardData, stage: string) => void;
}) {
  const openStages = stages.filter((stage) => !stage.isTerminal);
  const closingStages = stages.filter((stage) => stage.isTerminal);
  const current = applicant ? stages.find((stage) => stage.code === applicant.stage) : undefined;
  const currentIndex = applicant ? openStages.findIndex((stage) => stage.code === applicant.stage) : -1;
  // A closed applicant went through every open stage (or left partway; the track can't tell, so it shows all as passed).
  const passedUpTo = current?.isTerminal ? openStages.length : currentIndex;

  return (
    <Sheet open={applicant !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
        {applicant && (
          <>
            <SheetHeader className="border-b">
              <div className="flex items-center gap-3 pr-8">
                <ApplicantAvatar name={applicant.applicantName} className="size-11 text-sm" />
                <div className="min-w-0">
                  <SheetTitle className="truncate">{applicant.applicantName}</SheetTitle>
                  <SheetDescription className="truncate">Applying for {applicant.positionTitle}</SheetDescription>
                </div>
              </div>
              {current && (
                <div className="pt-1">
                  <StatusBadge status={current.code} label={current.name} tone={BADGE_TONE[stageTone(current)]} />
                </div>
              )}
            </SheetHeader>

            <section className="flex flex-col gap-3 border-b p-4" aria-labelledby="applicant-stage-heading">
              <h3 id="applicant-stage-heading" className="text-[13px] font-semibold text-foreground">
                Stage
              </h3>
              <ol className="flex flex-col gap-1">
                {openStages.map((stage, index) => {
                  const isCurrent = stage.code === applicant.stage;
                  const isPassed = index < passedUpTo;
                  return (
                    <li key={stage.code}>
                      <button
                        type="button"
                        disabled={!canUpdate || isCurrent}
                        onClick={() => onMove(applicant, stage.code)}
                        aria-current={isCurrent ? "step" : undefined}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition-colors enabled:cursor-pointer enabled:hover:bg-muted",
                          isCurrent && "bg-primary/5 font-medium text-primary",
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-6 shrink-0 items-center justify-center rounded-full border text-[0.7rem] font-semibold tabular-nums",
                            isPassed && "border-primary bg-primary text-primary-foreground",
                            isCurrent && "border-primary text-primary ring-3 ring-primary/15",
                            !isPassed && !isCurrent && "text-muted-foreground",
                          )}
                          aria-hidden="true"
                        >
                          {isPassed ? <Check className="size-3.5" /> : index + 1}
                        </span>
                        {stage.name}
                      </button>
                    </li>
                  );
                })}
              </ol>
              {closingStages.length > 0 && (
                <div className="flex flex-wrap gap-2 border-t pt-3">
                  {closingStages.map((stage) => {
                    const isCurrent = stage.code === applicant.stage;
                    const tone = stageTone(stage);
                    return (
                      <button
                        key={stage.code}
                        type="button"
                        disabled={!canUpdate || isCurrent}
                        onClick={() => onMove(applicant, stage.code)}
                        aria-current={isCurrent ? "step" : undefined}
                        className={cn(
                          "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors enabled:cursor-pointer",
                          tone === "success" ? "enabled:hover:border-success/40 enabled:hover:bg-success/10" : "enabled:hover:bg-muted",
                          isCurrent && tone === "success" && "border-success/40 bg-success/10 text-success",
                          isCurrent && tone !== "success" && "bg-muted text-foreground",
                        )}
                      >
                        {stage.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="flex flex-col gap-3 p-4" aria-labelledby="applicant-details-heading">
              <h3 id="applicant-details-heading" className="text-[13px] font-semibold text-foreground">
                Details
              </h3>
              <dl className="flex flex-col gap-3 text-sm">
                <Detail icon={Briefcase} label="Position">
                  {applicant.positionTitle}
                </Detail>
                <Detail icon={CalendarDays} label="Applied">
                  {new Date(applicant.appliedDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}
                  <span className="block text-xs text-muted-foreground">{describeApplied(daysSince(applicant.appliedDate, now))}</span>
                </Detail>
                <Detail icon={Mail} label="Email">
                  {applicant.email ? (
                    <a href={`mailto:${applicant.email}`} className="text-primary hover:underline">
                      {applicant.email}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">Not provided</span>
                  )}
                </Detail>
                <Detail icon={Phone} label="Phone">
                  {applicant.phone ? (
                    <a href={`tel:${applicant.phone.replace(/\s+/g, "")}`} className="text-primary hover:underline">
                      {applicant.phone}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">Not provided</span>
                  )}
                </Detail>
                <Detail icon={StickyNote} label="Remarks">
                  {applicant.remarks ? <span className="whitespace-pre-line">{applicant.remarks}</span> : <span className="text-muted-foreground">None</span>}
                </Detail>
              </dl>
              {canUpdate && (
                <div className="flex justify-end border-t pt-3">
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
                </div>
              )}
            </section>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Detail({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="break-words">{children}</dd>
      </div>
    </div>
  );
}
