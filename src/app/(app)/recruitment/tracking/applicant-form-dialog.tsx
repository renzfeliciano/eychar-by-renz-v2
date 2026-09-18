"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, UserPlus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormField, FormError, RequiredFieldsHint } from "@/components/shared/form-field";
import { OptionSelect, type SelectOption } from "@/components/shared/option-select";
import { cn } from "@/lib/utils";

export type ApplicantFormValue = {
  id: string;
  positionId: string;
  applicantName: string;
  email?: string | null;
  phone?: string | null;
  appliedDate: string;
  remarks?: string | null;
};

function toDateInputValue(value: string): string {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

/** One form, two modes — mirroring the legacy v1 app's Application form dialog, reused for both create and a full edit. */
export function ApplicantFormDialog({
  organizationId,
  positions,
  initialApplicant,
}: {
  organizationId: string;
  positions: SelectOption[];
  initialApplicant?: ApplicantFormValue;
}) {
  const isEdit = Boolean(initialApplicant);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [positionId, setPositionId] = useState(initialApplicant?.positionId ?? "");
  const [applicantName, setApplicantName] = useState(initialApplicant?.applicantName ?? "");
  const [email, setEmail] = useState(initialApplicant?.email ?? "");
  const [phone, setPhone] = useState(initialApplicant?.phone ?? "");
  const [appliedDate, setAppliedDate] = useState(initialApplicant ? toDateInputValue(initialApplicant.appliedDate) : "");
  const [remarks, setRemarks] = useState(initialApplicant?.remarks ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!positionId) {
      setError("Select a position.");
      return;
    }
    setIsSubmitting(true);

    const response = await fetch(isEdit ? `/api/applicants/${initialApplicant!.id}` : "/api/applicants", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId,
        positionId,
        applicantName,
        email: email || undefined,
        phone: phone || undefined,
        appliedDate,
        remarks: remarks || undefined,
      }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? `Failed to ${isEdit ? "save" : "add"} applicant.`);
      return;
    }

    if (!isEdit) {
      setPositionId("");
      setApplicantName("");
      setEmail("");
      setPhone("");
      setAppliedDate("");
      setRemarks("");
    }
    setOpen(false);
    router.refresh();
  }

  const formId = `applicant-form-${initialApplicant?.id ?? "new"}`;

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setPositionId(initialApplicant?.positionId ?? "");
      setApplicantName(initialApplicant?.applicantName ?? "");
      setEmail(initialApplicant?.email ?? "");
      setPhone(initialApplicant?.phone ?? "");
      setAppliedDate(initialApplicant ? toDateInputValue(initialApplicant.appliedDate) : "");
      setRemarks(initialApplicant?.remarks ?? "");
      setError(null);
    }
    setOpen(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        className={cn(isEdit ? buttonVariants({ size: "sm", variant: "ghost" }) : buttonVariants({ size: "sm" }))}
        aria-label={isEdit ? "Edit applicant" : undefined}
        data-testid={isEdit ? "applicant-edit-button" : "applicants-create-button"}
      >
        {isEdit ? <Pencil className="size-3.5" /> : (
          <>
            <Plus className="size-3.5" />
            Add applicant
          </>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit applicant" : "Add applicant"}</DialogTitle>
        </DialogHeader>
        <form id={formId} onSubmit={handleSubmit} className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto pr-1">
          <RequiredFieldsHint />
          <FormField label="Applicant name" htmlFor={`${formId}-name`} required>
            <Input id={`${formId}-name`} value={applicantName} onChange={(event) => setApplicantName(event.target.value)} placeholder="e.g. Dela Cruz, Juan Miguel" required />
          </FormField>
          <OptionSelect label="Position" value={positionId} onChange={setPositionId} options={positions} placeholder="Select a position" required />
          <FormField label="Email" htmlFor={`${formId}-email`}>
            <Input id={`${formId}-email`} type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="e.g. juan.delacruz@email.com" />
          </FormField>
          <FormField label="Phone" htmlFor={`${formId}-phone`}>
            <Input id={`${formId}-phone`} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="09XX-XXX-XXXX" />
          </FormField>
          <FormField label="Applied date" htmlFor={`${formId}-applied`} required>
            <Input id={`${formId}-applied`} type="date" value={appliedDate} onChange={(event) => setAppliedDate(event.target.value)} required />
          </FormField>
          <FormField label="Remarks" htmlFor={`${formId}-remarks`}>
            <Textarea id={`${formId}-remarks`} value={remarks} onChange={(event) => setRemarks(event.target.value)} />
          </FormField>
          <FormError message={error} />
        </form>
        <DialogFooter>
          <Button type="submit" form={formId} disabled={isSubmitting} data-testid={isEdit ? "applicant-save-button" : "applicants-create-submit-button"}>
            {isEdit ? (
              isSubmitting ? "Saving…" : "Save changes"
            ) : (
              <>
                <UserPlus className="size-3.5" />
                {isSubmitting ? "Adding…" : "Add applicant"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
