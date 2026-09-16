"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, X, UserCheck } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormField, FormError } from "@/components/shared/form-field";
import { OptionSelect, type SelectOption } from "@/components/shared/option-select";
import { cn } from "@/lib/utils";

export type StageInfo = { _id: string; code: string; name: string; sortOrder: number; isTerminal: boolean };
export type ApplicantCardData = {
  _id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  stage: string;
  rejectionReason?: string | null;
  hiredEmployeeId?: string;
  positionTitle: string;
};
export type AssignmentOptions = {
  positions: SelectOption[];
  projects: SelectOption[];
  locations: SelectOption[];
  organizationUnits: SelectOption[];
  managers: SelectOption[];
  employmentTypes: SelectOption[];
};

async function patchApplicant(id: string, organizationId: string, body: Record<string, unknown>) {
  return fetch(`/api/applicants/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ organizationId, ...body }),
  });
}

export function ApplicantCard({
  organizationId,
  applicant,
  stages,
  canUpdate,
  canHire,
  assignmentOptions,
}: {
  organizationId: string;
  applicant: ApplicantCardData;
  stages: StageInfo[];
  canUpdate: boolean;
  canHire: boolean;
  assignmentOptions: AssignmentOptions;
}) {
  const router = useRouter();
  const [moveTarget, setMoveTarget] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [hireOpen, setHireOpen] = useState(false);
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [positionId, setPositionId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [organizationUnitId, setOrganizationUnitId] = useState("");
  const [reportsToEmployeeId, setReportsToEmployeeId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentStage = stages.find((stage) => stage.code === applicant.stage);
  const isTerminal = currentStage?.isTerminal ?? false;
  const nonTerminalStages = stages.filter((stage) => !stage.isTerminal);
  const maxSortOrder = nonTerminalStages.length > 0 ? Math.max(...nonTerminalStages.map((stage) => stage.sortOrder)) : -1;
  const isFinalPreTerminal = Boolean(currentStage) && !isTerminal && currentStage!.sortOrder === maxSortOrder;
  const forwardOptions: SelectOption[] = currentStage
    ? nonTerminalStages.filter((stage) => stage.sortOrder > currentStage.sortOrder).map((stage) => ({ id: stage.code, label: stage.name }))
    : [];

  async function handleMove() {
    if (!moveTarget) return;
    setIsSubmitting(true);
    const response = await patchApplicant(applicant._id, organizationId, { action: "advance", stage: moveTarget });
    setIsSubmitting(false);
    if (response.ok) router.refresh();
  }

  async function handleReject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const response = await patchApplicant(applicant._id, organizationId, { action: "reject", reason: rejectionReason || undefined });
    setIsSubmitting(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to reject applicant.");
      return;
    }
    setRejectOpen(false);
    router.refresh();
  }

  async function handleHire(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!employmentType) {
      setError("Select an employment type.");
      return;
    }
    setIsSubmitting(true);
    const response = await patchApplicant(applicant._id, organizationId, {
      action: "hire",
      employeeNumber,
      employmentType,
      positionId: positionId || undefined,
      projectId: projectId || undefined,
      locationId: locationId || undefined,
      organizationUnitId: organizationUnitId || undefined,
      reportsToEmployeeId: reportsToEmployeeId || undefined,
    });
    setIsSubmitting(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to hire applicant.");
      return;
    }
    setHireOpen(false);
    router.refresh();
  }

  return (
    <Card className="gap-2 py-3 shadow-[var(--shadow-soft)]" data-testid="tracking-applicant-card">
      <CardContent className="flex flex-col gap-2 px-3">
        <div>
          <p className="text-sm font-medium">{applicant.firstName} {applicant.lastName}</p>
          <p className="text-xs text-muted-foreground">{applicant.positionTitle}</p>
        </div>

        {isTerminal ? (
          <div className="text-xs text-muted-foreground">
            {applicant.stage === "rejected" && applicant.rejectionReason && <p>Reason: {applicant.rejectionReason}</p>}
            {applicant.hiredEmployeeId && (
              <Link href={`/people/${applicant.hiredEmployeeId}`} className="text-primary hover:underline">
                View employee
              </Link>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {canUpdate && forwardOptions.length > 0 && (
              <div className="flex items-end gap-1.5">
                <OptionSelect label="Move to" value={moveTarget} onChange={setMoveTarget} options={forwardOptions} placeholder="Next stage" />
                <Button size="icon-sm" variant="outline" onClick={handleMove} disabled={!moveTarget || isSubmitting} aria-label="Move applicant">
                  <ArrowRight className="size-3.5" />
                </Button>
              </div>
            )}
            <div className="flex gap-1.5">
              {canUpdate && (
                <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
                  <DialogTrigger className={cn(buttonVariants({ size: "sm", variant: "ghost" }))} data-testid="applicant-reject-button">
                    <X className="size-3.5" />
                    Reject
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Reject applicant</DialogTitle>
                    </DialogHeader>
                    <form id={`reject-form-${applicant._id}`} onSubmit={handleReject} className="flex flex-col gap-4">
                      <FormField label="Reason (optional)" htmlFor={`reject-reason-${applicant._id}`}>
                        <Input id={`reject-reason-${applicant._id}`} value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} />
                      </FormField>
                      <FormError message={error} />
                    </form>
                    <DialogFooter>
                      <Button type="submit" form={`reject-form-${applicant._id}`} variant="destructive" disabled={isSubmitting}>
                        {isSubmitting ? "Rejecting…" : "Reject"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
              {canHire && isFinalPreTerminal && (
                <Dialog open={hireOpen} onOpenChange={setHireOpen}>
                  <DialogTrigger className={cn(buttonVariants({ size: "sm", variant: "default" }))} data-testid="applicant-hire-button">
                    <UserCheck className="size-3.5" />
                    Hire
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Hire {applicant.firstName} {applicant.lastName}</DialogTitle>
                    </DialogHeader>
                    <form
                      id={`hire-form-${applicant._id}`}
                      onSubmit={handleHire}
                      className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto pr-1"
                    >
                      <FormField label="Employee number" htmlFor={`employee-number-${applicant._id}`}>
                        <Input id={`employee-number-${applicant._id}`} value={employeeNumber} onChange={(event) => setEmployeeNumber(event.target.value)} required />
                      </FormField>
                      <OptionSelect label="Employment type" value={employmentType} onChange={setEmploymentType} options={assignmentOptions.employmentTypes} placeholder="Select a type" />
                      <OptionSelect label="Position" value={positionId} onChange={setPositionId} options={assignmentOptions.positions} />
                      <OptionSelect label="Project" value={projectId} onChange={setProjectId} options={assignmentOptions.projects} />
                      <OptionSelect label="Organization unit" value={organizationUnitId} onChange={setOrganizationUnitId} options={assignmentOptions.organizationUnits} />
                      <OptionSelect label="Location" value={locationId} onChange={setLocationId} options={assignmentOptions.locations} />
                      <OptionSelect label="Reports to" value={reportsToEmployeeId} onChange={setReportsToEmployeeId} options={assignmentOptions.managers} />
                      <FormError message={error} />
                    </form>
                    <DialogFooter>
                      <Button type="submit" form={`hire-form-${applicant._id}`} disabled={isSubmitting}>
                        {isSubmitting ? "Hiring…" : "Hire"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
