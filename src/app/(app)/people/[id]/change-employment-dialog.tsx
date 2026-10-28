"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileSignature, Save } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormError, FormField, RequiredFieldsHint } from "@/components/shared/form-field";
import { OptionSelect } from "@/components/shared/option-select";
import { useFieldErrors } from "@/lib/field-errors";
import { cn } from "@/lib/utils";

export type EmploymentTypeChoice = { code: string; name: string; requiresEndOfContract: boolean };

/** Control ids for the fields an API error can land on. */
const FIELD_IDS = {
  employmentType: "change-employment-type",
  effectiveFrom: "change-employment-effective",
  endOfContract: "change-employment-end",
  note: "change-employment-note",
} as const;

/**
 * Regularize, renew a contract, or move to another employment type. The
 * same employment continues, so the hire date and length of service stay
 * (ADR-052); the change is kept in the employment's history.
 */
export function ChangeEmploymentDialog({
  organizationId,
  employeeId,
  employeeName,
  currentType,
  currentEndKey,
  types,
  todayKey,
}: {
  organizationId: string;
  employeeId: string;
  employeeName: string;
  currentType: string;
  /** "YYYY-MM-DD", when the current contract has an end date. */
  currentEndKey: string | null;
  types: EmploymentTypeChoice[];
  /** "YYYY-MM-DD" in the app's zone: the default effective date. */
  todayKey: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [employmentType, setEmploymentType] = useState(currentType);
  const [effectiveFrom, setEffectiveFrom] = useState(todayKey);
  const [endOfContract, setEndOfContract] = useState(currentEndKey ?? "");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { fieldErrors, formError, setFromResponse, setFieldError, clearField, clear } = useFieldErrors({ fieldIds: FIELD_IDS });

  const selected = types.find((type) => type.code === employmentType);
  const needsEnd = Boolean(selected?.requiresEndOfContract);

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setEmploymentType(currentType);
      setEffectiveFrom(todayKey);
      setEndOfContract(currentEndKey ?? "");
      setNote("");
      clear();
    }
    setOpen(nextOpen);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clear();
    if (!employmentType) return setFieldError("employmentType", "Choose the employment type.");
    if (!effectiveFrom) return setFieldError("effectiveFrom", "Enter the date the change takes effect.");
    if (needsEnd && !endOfContract) return setFieldError("endOfContract", `Enter when the contract ends: ${selected?.name ?? "this type"} needs an end date.`);

    setIsSubmitting(true);
    const response = await fetch(`/api/employees/${employeeId}/employment/terms`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId,
        employmentType,
        effectiveFrom,
        endOfContract: needsEnd ? endOfContract : undefined,
        note: note.trim() || undefined,
      }),
    });
    setIsSubmitting(false);

    if (!response.ok) {
      setFromResponse(await response.json().catch(() => ({})), "The change wasn't saved. Try again.");
      return;
    }

    setOpen(false);
    toast.success(employmentType === currentType ? `Contract updated for ${employeeName}` : `${employeeName} is now ${selected?.name ?? employmentType}`);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }))} data-testid="change-employment-button">
        <FileSignature className="size-3.5" aria-hidden="true" />
        Change employment
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change employment</DialogTitle>
          <DialogDescription>Regularize {employeeName}, renew the contract, or change the type. The hire date and length of service stay the same.</DialogDescription>
        </DialogHeader>
        <form id="change-employment-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <RequiredFieldsHint />
          <OptionSelect
            id={FIELD_IDS.employmentType}
            label="Employment type"
            value={employmentType}
            onChange={(value) => {
              setEmploymentType(value);
              clearField("employmentType");
            }}
            options={types.map((type) => ({ id: type.code, label: type.name }))}
            placeholder="Choose a type"
            required
            error={fieldErrors.employmentType}
            testId="change-employment-type"
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Takes effect" htmlFor={FIELD_IDS.effectiveFrom} required error={fieldErrors.effectiveFrom}>
              <Input id={FIELD_IDS.effectiveFrom} type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} required />
            </FormField>
            {needsEnd && (
              <FormField label="End of contract" htmlFor={FIELD_IDS.endOfContract} required error={fieldErrors.endOfContract}>
                <Input id={FIELD_IDS.endOfContract} type="date" value={endOfContract} onChange={(event) => setEndOfContract(event.target.value)} required />
              </FormField>
            )}
          </div>
          {!needsEnd && selected && <p className="text-sm text-muted-foreground">{selected.name} has no end of contract, so any end date on file is cleared.</p>}
          <FormField label="Note" htmlFor={FIELD_IDS.note} description="Optional, e.g. the evaluation or memo behind the change." error={fieldErrors.note}>
            <Textarea id={FIELD_IDS.note} value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} rows={3} />
          </FormField>
          {formError && <FormError message={formError} />}
        </form>
        <DialogFooter>
          <Button type="submit" form="change-employment-form" icon={Save} pending={isSubmitting} pendingLabel="Saving…" data-testid="change-employment-submit">
            Save change
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
