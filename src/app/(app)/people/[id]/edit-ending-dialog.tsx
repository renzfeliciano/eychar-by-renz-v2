"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Save } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormError, FormField, RequiredFieldsHint } from "@/components/shared/form-field";
import { OptionSelect } from "@/components/shared/option-select";
import { useFieldErrors } from "@/lib/field-errors";
import { cn } from "@/lib/utils";
import type { EndReasonChoice } from "./end-employment-dialog";

const FIELD_IDS = {
  status: "edit-ending-reason",
  effectiveTo: "edit-ending-date",
  terminationReason: "edit-ending-note",
} as const;

/**
 * Corrects how an employment ended, in one step and without the person ever showing as active: the reason
 * (for example Terminated to Resigned), the last day, or the note. It opens on the ending as recorded and keeps
 * Save off until something differs. Once a final settlement was prepared the last day is locked (the reason
 * and note never are), and the dialog says why. The same checks as End employment run here; the server repeats them.
 */
export function EditEndingDialog({
  organizationId,
  employeeId,
  employeeName,
  reasons,
  todayKey,
  hiredKey,
  current,
  lastDayLockedReason,
}: {
  organizationId: string;
  employeeId: string;
  employeeName: string;
  reasons: EndReasonChoice[];
  /** "YYYY-MM-DD" in the app's zone: the latest allowed last day. */
  todayKey: string;
  /** "YYYY-MM-DD", the first day of this employment: the earliest allowed last day. */
  hiredKey: string | null;
  current: { status: string; effectiveToKey: string; note: string };
  /** The server's message when the last day can't change, or null. */
  lastDayLockedReason: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(current.status);
  const [effectiveTo, setEffectiveTo] = useState(current.effectiveToKey);
  const [note, setNote] = useState(current.note);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { fieldErrors, formError, setFromResponse, setFieldError, clearField, clear } = useFieldErrors({ fieldIds: FIELD_IDS });

  const locked = lastDayLockedReason !== null;
  // The current reason is always offered, even if the catalog no longer lists it as one that ends employment.
  const options = reasons.map((reason) => ({ id: reason.code, label: reason.name }));
  if (!options.some((option) => option.id === current.status)) options.push({ id: current.status, label: current.status });
  const selected = reasons.find((reason) => reason.code === status);
  const needsNote = Boolean(selected?.requiresNote);
  const changed = status !== current.status || (!locked && effectiveTo !== current.effectiveToKey) || note.trim() !== current.note.trim();

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setStatus(current.status);
      setEffectiveTo(current.effectiveToKey);
      setNote(current.note);
      clear();
    }
    setOpen(nextOpen);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clear();
    if (!locked) {
      if (!effectiveTo) return setFieldError("effectiveTo", "Enter the last day of employment.");
      if (effectiveTo > todayKey) return setFieldError("effectiveTo", "The last day can't be in the future yet. End the employment on the last working day.");
      if (hiredKey && effectiveTo < hiredKey) return setFieldError("effectiveTo", `The last day can't be before ${employeeName} was hired.`);
    }
    if (needsNote && !note.trim()) return setFieldError("terminationReason", `Add a note for ${selected!.name}: say what led to it.`);

    setIsSubmitting(true);
    const response = await fetch(`/api/employees/${employeeId}/employment/ending`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, status, ...(locked ? {} : { effectiveTo }), terminationReason: note.trim() }),
    });
    setIsSubmitting(false);

    if (!response.ok) {
      setFromResponse(await response.json().catch(() => ({})), "The ending wasn't changed. Try again.");
      return;
    }

    setOpen(false);
    toast.success(`${employeeName}'s ending was corrected: ${selected?.name ?? status}`);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }))} data-testid="edit-ending-button">
        <Pencil className="size-3.5" aria-hidden="true" />
        Edit ending
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit ending</DialogTitle>
          <DialogDescription>Correct how {employeeName}&apos;s employment ended, for example a resignation recorded as a termination. They stay ended; nothing about their pay-out changes.</DialogDescription>
        </DialogHeader>
        <form id="edit-ending-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <RequiredFieldsHint />
          <OptionSelect
            id={FIELD_IDS.status}
            label="Reason"
            value={status}
            onChange={(value) => {
              setStatus(value);
              clearField("status");
              clearField("terminationReason");
            }}
            options={options}
            placeholder="Choose a reason"
            required
            error={fieldErrors.status}
            testId="edit-ending-reason"
          />
          <FormField
            label="Last day of employment"
            htmlFor={FIELD_IDS.effectiveTo}
            required
            error={fieldErrors.effectiveTo}
            description={locked ? lastDayLockedReason : "Today or earlier."}
          >
            <Input
              id={FIELD_IDS.effectiveTo}
              type="date"
              value={effectiveTo}
              min={hiredKey ?? undefined}
              max={todayKey}
              disabled={locked}
              onChange={(event) => {
                setEffectiveTo(event.target.value);
                clearField("effectiveTo");
              }}
              required
            />
          </FormField>
          <FormField label="Note" htmlFor={FIELD_IDS.terminationReason} required={needsNote} description={needsNote ? "Required for this reason." : "Optional, e.g. the resignation letter reference."} error={fieldErrors.terminationReason}>
            <Textarea
              id={FIELD_IDS.terminationReason}
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                clearField("terminationReason");
              }}
              maxLength={2000}
              rows={3}
            />
          </FormField>
          {formError && <FormError message={formError} />}
        </form>
        <DialogFooter>
          <Button type="submit" form="edit-ending-form" icon={Save} pending={isSubmitting} pendingLabel="Saving…" disabled={!changed} data-testid="edit-ending-submit">
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
