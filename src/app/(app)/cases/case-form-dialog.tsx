"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Scale } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormField, FormError, RequiredFieldsHint } from "@/components/shared/form-field";
import { OptionSelect, type SelectOption } from "@/components/shared/option-select";
import { cn } from "@/lib/utils";

export type CaseFormValue = {
  id: string;
  projectId: string;
  caseName: string;
  caseNumber: string;
  classification: string;
  status: string;
  legalCounsel?: string | null;
  briefHistory?: string | null;
};

/**
 * One form, two modes — mirroring the legacy v1 app's Case Monitoring
 * dialog, which reuses the exact same fields for creating and fully
 * editing a case (not a narrower "update status only" form).
 */
export function CaseFormDialog({
  organizationId,
  projects,
  classifications,
  statuses,
  initialCase,
}: {
  organizationId: string;
  projects: SelectOption[];
  classifications: SelectOption[];
  statuses: SelectOption[];
  initialCase?: CaseFormValue;
}) {
  const isEdit = Boolean(initialCase);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState(initialCase?.projectId ?? "");
  const [caseName, setCaseName] = useState(initialCase?.caseName ?? "");
  const [caseNumber, setCaseNumber] = useState(initialCase?.caseNumber ?? "");
  const [classification, setClassification] = useState(initialCase?.classification ?? "");
  const [status, setStatus] = useState(initialCase?.status ?? "");
  const [legalCounsel, setLegalCounsel] = useState(initialCase?.legalCounsel ?? "");
  const [briefHistory, setBriefHistory] = useState(initialCase?.briefHistory ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!projectId || !classification || !status) {
      setError("Select a project, classification, and status.");
      return;
    }
    setIsSubmitting(true);

    const response = await fetch(isEdit ? `/api/cases/${initialCase!.id}` : "/api/cases", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId,
        projectId,
        caseName,
        caseNumber,
        classification,
        status,
        legalCounsel: legalCounsel || undefined,
        briefHistory: briefHistory || undefined,
      }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? `Failed to ${isEdit ? "save" : "add"} case.`);
      return;
    }

    if (!isEdit) {
      setProjectId("");
      setCaseName("");
      setCaseNumber("");
      setClassification("");
      setStatus("");
      setLegalCounsel("");
      setBriefHistory("");
    }
    setOpen(false);
    router.refresh();
  }

  const formId = `case-form-${initialCase?.id ?? "new"}`;

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setProjectId(initialCase?.projectId ?? "");
      setCaseName(initialCase?.caseName ?? "");
      setCaseNumber(initialCase?.caseNumber ?? "");
      setClassification(initialCase?.classification ?? "");
      setStatus(initialCase?.status ?? "");
      setLegalCounsel(initialCase?.legalCounsel ?? "");
      setBriefHistory(initialCase?.briefHistory ?? "");
      setError(null);
    }
    setOpen(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        className={cn(isEdit ? buttonVariants({ size: "sm", variant: "ghost" }) : buttonVariants({ size: "sm" }))}
        aria-label={isEdit ? "Edit case" : undefined}
        data-testid={isEdit ? "case-edit-button" : "cases-create-button"}
      >
        {isEdit ? <Pencil className="size-3.5" /> : (
          <>
            <Plus className="size-3.5" />
            Add case
          </>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit case" : "Add case"}</DialogTitle>
          <DialogDescription>{isEdit ? "Updates details on this case record." : "Opens a new legal, labor, or regulatory case against the company for tracking."}</DialogDescription>
        </DialogHeader>
        <form id={formId} onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <RequiredFieldsHint />
          <OptionSelect label="Project" value={projectId} onChange={setProjectId} options={projects} placeholder="Select a project" required />
          <FormField label="Case number" htmlFor={`${formId}-number`} required>
            <Input id={`${formId}-number`} value={caseNumber} onChange={(event) => setCaseNumber(event.target.value)} placeholder="e.g. NLRC-NCR-01-00123-26" required />
          </FormField>
          <FormField label="Case name" htmlFor={`${formId}-name`} required>
            <Input id={`${formId}-name`} value={caseName} onChange={(event) => setCaseName(event.target.value)} placeholder="e.g. Dela Cruz vs. PCAS Corp" required />
          </FormField>
          <OptionSelect label="Classification" value={classification} onChange={setClassification} options={classifications} placeholder="Select a classification" required />
          <OptionSelect label="Status" value={status} onChange={setStatus} options={statuses} placeholder="Select a status" required />
          <FormField label="Legal counsel" htmlFor={`${formId}-counsel`}>
            <Input id={`${formId}-counsel`} value={legalCounsel} onChange={(event) => setLegalCounsel(event.target.value)} placeholder="e.g. Atty. Juan Dela Cruz" />
          </FormField>
          <FormField label="Brief history" htmlFor={`${formId}-history`}>
            <Textarea id={`${formId}-history`} value={briefHistory} onChange={(event) => setBriefHistory(event.target.value)} placeholder="Summarize the case background and current developments" />
          </FormField>
          <FormError message={error} />
        </form>
        <DialogFooter>
          <Button type="submit" form={formId} disabled={isSubmitting} data-testid={isEdit ? "case-save-button" : "cases-create-submit-button"}>
            {isEdit ? (
              isSubmitting ? "Saving…" : "Save changes"
            ) : (
              <>
                <Scale className="size-3.5" />
                {isSubmitting ? "Adding…" : "Add case"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
