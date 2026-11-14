"use client";

import { useState } from "react";
import { Check, CalendarDays, Hash, MapPin, Pencil, StickyNote, User, Building2, UserRound, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/shared/status-badge";
import type { SelectOption } from "@/components/shared/option-select";
import { hasSectionData, sectionFields, type SectionField } from "@/domains/complaints/stage-sections";
import { cn } from "@/lib/utils";
import { RespondentAvatar, formatReceived, type ComplaintCardData, type StageInfo } from "./complaint-card";
import { ComplaintFormDialog } from "./complaint-form-dialog";
import { StageDetailsDialog, type SectionValues } from "./stage-details-dialog";

const formatDay = (value: string) => formatReceived(value, "long");

/** A stored value as people read it: dates as calendar days, a choice by its label. */
function displayValue(field: SectionField, value: string): string {
  if (field.kind === "date") return formatDay(value);
  if (field.kind === "choice") return field.options?.find((option) => option.value === value)?.label ?? value;
  return value;
}

/**
 * The complaint's side panel: who it is about, when it was received, and where it stands.
 * The stage track is also the control: pick a stage to move the complaint there.
 */
export function ComplaintSheet({
  complaint,
  stages,
  employees,
  projects,
  organizationId,
  canUpdate,
  onClose,
  onMove,
  onSaveDetails,
}: {
  complaint: ComplaintCardData | null;
  stages: StageInfo[];
  employees: SelectOption[];
  projects: SelectOption[];
  organizationId: string;
  canUpdate: boolean;
  onClose: () => void;
  onMove: (complaint: ComplaintCardData, stage: string) => void;
  /** Saves one stage's details; resolves to an error message to show in the form, or null when saved. */
  onSaveDetails: (complaint: ComplaintCardData, stage: string, values: SectionValues) => Promise<string | null>;
}) {
  const [editingStage, setEditingStage] = useState<string | null>(null);
  const openStages = stages.filter((stage) => !stage.isTerminal);
  const closingStages = stages.filter((stage) => stage.isTerminal);
  const current = complaint ? stages.find((stage) => stage.code === complaint.stage) : undefined;
  const currentIndex = complaint ? openStages.findIndex((stage) => stage.code === complaint.stage) : -1;
  // A closed complaint went through every open stage (or was closed early; the track can't tell, so it shows all as passed).
  const passedUpTo = current?.isTerminal ? openStages.length : currentIndex;

  // One block per stage except the first, whose details are the incident fields above. A stage the catalog no longer lists still shows when it holds details.
  const details = complaint?.stageDetails ?? {};
  const firstStageCode = stages[0]?.code;
  const sections = [
    ...stages.filter((stage) => stage.code !== firstStageCode || hasSectionData(details[stage.code])).map((stage) => ({ code: stage.code, name: stage.name })),
    ...Object.keys(details)
      .filter((code) => !stages.some((stage) => stage.code === code))
      .map((code) => ({ code, name: code })),
  ];
  const editing = sections.find((section) => section.code === editingStage);

  return (
    <Sheet open={complaint !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
        {complaint && (
          <>
            <SheetHeader className="border-b">
              <div className="flex items-center gap-3 pr-8">
                <RespondentAvatar name={complaint.respondentName} className="size-11 text-sm" />
                <div className="min-w-0">
                  <SheetTitle className="truncate">{complaint.irNumber}</SheetTitle>
                  <SheetDescription className="truncate">Complaint about {complaint.respondentName}</SheetDescription>
                </div>
              </div>
              {current && (
                <div className="flex flex-col gap-1 pt-1">
                  <StatusBadge status={current.code} label={current.name} tone={current.isTerminal ? "neutral" : "info"} />
                  {current.description && <p className="text-xs text-muted-foreground">{current.description}</p>}
                </div>
              )}
            </SheetHeader>

            <section className="flex flex-col gap-3 border-b p-4" aria-labelledby="complaint-stage-heading">
              <h3 id="complaint-stage-heading" className="text-[13px] font-semibold text-foreground">
                Stage
              </h3>
              <ol className="flex flex-col gap-1">
                {openStages.map((stage, index) => {
                  const isCurrent = stage.code === complaint.stage;
                  const isPassed = index < passedUpTo;
                  return (
                    <li key={stage.code}>
                      <button
                        type="button"
                        disabled={!canUpdate || isCurrent}
                        onClick={() => onMove(complaint, stage.code)}
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
                    const isCurrent = stage.code === complaint.stage;
                    return (
                      <button
                        key={stage.code}
                        type="button"
                        disabled={!canUpdate || isCurrent}
                        onClick={() => onMove(complaint, stage.code)}
                        aria-current={isCurrent ? "step" : undefined}
                        title={stage.description}
                        className={cn("flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors enabled:cursor-pointer enabled:hover:bg-muted", isCurrent && "bg-muted text-foreground")}
                      >
                        {stage.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="flex flex-col gap-3 p-4" aria-labelledby="complaint-details-heading">
              <h3 id="complaint-details-heading" className="text-[13px] font-semibold text-foreground">
                Details
              </h3>
              <dl className="flex flex-col gap-3 text-sm">
                <Detail icon={Hash} label="IR number">
                  {complaint.irNumber}
                </Detail>
                <Detail icon={User} label="Respondent">
                  {complaint.respondentName}
                </Detail>
                <Detail icon={CalendarDays} label="Date received">
                  {formatReceived(complaint.receivedDate, "long")}
                </Detail>
                <Detail icon={Building2} label="Project/Site">
                  <Optional>{complaint.projectName}</Optional>
                </Detail>
                <Detail icon={UserRound} label="Complainant">
                  <Optional>{complaint.complainantName}</Optional>
                </Detail>
                <Detail icon={FileText} label="Brief description">
                  <Optional>{complaint.description}</Optional>
                </Detail>
                <Detail icon={FileText} label="What">
                  <Optional>{complaint.what}</Optional>
                </Detail>
                <Detail icon={MapPin} label="Where">
                  <Optional>{complaint.where}</Optional>
                </Detail>
                <Detail icon={CalendarDays} label="Date of incident">
                  {complaint.incidentDate ? formatDay(complaint.incidentDate) : <span className="text-muted-foreground">—</span>}
                </Detail>
                <Detail icon={StickyNote} label="Remarks">
                  {complaint.remarks ? <span className="whitespace-pre-line">{complaint.remarks}</span> : <span className="text-muted-foreground">None</span>}
                </Detail>
              </dl>
              {canUpdate && (
                <div className="flex justify-end border-t pt-3">
                  <ComplaintFormDialog
                    organizationId={organizationId}
                    projects={projects}
                    // A respondent whose record is gone is not in the list; keep them selectable so saving does not change who it is about.
                    employees={employees.some((employee) => employee.id === complaint.employeeId) ? employees : [{ id: complaint.employeeId, label: "Unknown employee (record removed)" }, ...employees]}
                    initialComplaint={{
                      id: complaint._id,
                      employeeId: complaint.employeeId,
                      receivedDate: complaint.receivedDate,
                      remarks: complaint.remarks,
                      projectId: complaint.projectId,
                      description: complaint.description,
                      what: complaint.what,
                      where: complaint.where,
                      incidentDate: complaint.incidentDate,
                      complainantName: complaint.complainantName,
                    }}
                  />
                </div>
              )}
            </section>

            {sections.map((section) => {
              const values = details[section.code];
              const filled = hasSectionData(values);
              const headingId = `complaint-section-${section.code}`;
              return (
                <section key={section.code} className="flex flex-col gap-3 border-t p-4" aria-labelledby={headingId}>
                  <div className="flex items-center justify-between gap-2">
                    <h3 id={headingId} className="text-[13px] font-semibold text-foreground">
                      {section.name} details
                    </h3>
                    {canUpdate && (
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Edit ${section.name} details`} onClick={() => setEditingStage(section.code)}>
                        <Pencil className="size-3.5" />
                      </Button>
                    )}
                  </div>
                  {filled ? (
                    <dl className="flex flex-col gap-2 text-sm">
                      {sectionFields(section.code)
                        .filter((field) => values[field.key])
                        .map((field) => (
                          <div key={field.key}>
                            <dt className="text-xs text-muted-foreground">{field.label}</dt>
                            <dd className="break-words whitespace-pre-line">{displayValue(field, values[field.key])}</dd>
                          </div>
                        ))}
                    </dl>
                  ) : (
                    <p className="text-sm text-muted-foreground">Not filled in yet</p>
                  )}
                </section>
              );
            })}

            <StageDetailsDialog
              open={editing !== undefined}
              onOpenChange={(open) => !open && setEditingStage(null)}
              stageCode={editing?.code ?? ""}
              title={`${editing?.name ?? ""} details`}
              description={`Details for ${complaint.irNumber} at this stage. Clear a field to remove it.`}
              initial={editing ? details[editing.code] : undefined}
              saveLabel="Save details"
              savePendingLabel="Saving…"
              onSave={(values) => onSaveDetails(complaint, editing!.code, values)}
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Optional({ children }: { children?: string | null }) {
  return children ? <span className="whitespace-pre-line">{children}</span> : <span className="text-muted-foreground">—</span>;
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
