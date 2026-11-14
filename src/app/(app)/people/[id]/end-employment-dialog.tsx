"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save, UserX } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormError, FormField, RequiredFieldsHint } from "@/components/shared/form-field";
import { OptionSelect } from "@/components/shared/option-select";
import { useFieldErrors } from "@/lib/field-errors";
import { cn } from "@/lib/utils";

/** One way employment can end: an employment status that is not active headcount. */
export type EndReasonChoice = { code: string; name: string; requiresNote: boolean };

/** Control ids for the fields an API error can land on. */
const FIELD_IDS = {
  status: "end-employment-reason",
  effectiveTo: "end-employment-date",
  terminationReason: "end-employment-note",
} as const;

/**
 * Ends the employee's current employment and records why: Resigned, Terminated,
 * AWOL, or whatever the organization has configured as a non-active status.
 * Nothing is preselected, so a resignation is never saved as a termination by
 * default. The end date is today or earlier for now: the status changes at once,
 * so HR ends the employment on the last working day.
 */
export function EndEmploymentDialog({
  organizationId,
  employeeId,
  employeeName,
  reasons,
  todayKey,
  hiredKey,
}: {
  organizationId: string;
  employeeId: string;
  employeeName: string;
  reasons: EndReasonChoice[];
  /** "YYYY-MM-DD" in the app's zone: the default and latest allowed end date. */
  todayKey: string;
  /** "YYYY-MM-DD", the first day of this employment: the earliest allowed end date. */
  hiredKey: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [effectiveTo, setEffectiveTo] = useState(todayKey);
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { fieldErrors, formError, setFromResponse, setFieldError, clearField, clear } = useFieldErrors({ fieldIds: FIELD_IDS });

  const selected = reasons.find((reason) => reason.code === status);
  const needsNote = Boolean(selected?.requiresNote);

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setStatus("");
      setEffectiveTo(todayKey);
      setNote("");
      clear();
    }
    setOpen(nextOpen);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clear();
    if (!selected) return setFieldError("status", "Choose why the employment is ending.");
    if (!effectiveTo) return setFieldError("effectiveTo", "Enter the last day of employment.");
    if (effectiveTo > todayKey) return setFieldError("effectiveTo", "The last day can't be in the future yet. End the employment on the last working day.");
    if (hiredKey && effectiveTo < hiredKey) return setFieldError("effectiveTo", `The last day can't be before ${employeeName} was hired.`);
    if (needsNote && !note.trim()) return setFieldError("terminationReason", `Add a note for ${selected.name}: say what led to it.`);

    setIsSubmitting(true);
    const response = await fetch(`/api/employees/${employeeId}/employment`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId,
        status: selected.code,
        effectiveTo,
        terminationReason: note.trim() || undefined,
      }),
    });
    setIsSubmitting(false);

    if (!response.ok) {
      setFromResponse(await response.json().catch(() => ({})), "The employment wasn't ended. Try again.");
      return;
    }

    setOpen(false);
    toast.success(`${employeeName}'s employment ended: ${selected.name}`);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger className={cn(buttonVariants({ variant: "destructive" }))} data-testid="end-employment-button">
        <UserX className="size-4" aria-hidden="true" />
        End employment
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>End employment</DialogTitle>
          <DialogDescription>
            Record why {employeeName}&apos;s employment is ending and the last day. This can&apos;t be undone from here; a later rehire starts a new employment.
          </DialogDescription>
        </DialogHeader>
        <form id="end-employment-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
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
            options={reasons.map((reason) => ({ id: reason.code, label: reason.name }))}
            placeholder="Choose a reason"
            required
            error={fieldErrors.status}
            testId="end-employment-reason"
          />
          <FormField label="Last day of employment" htmlFor={FIELD_IDS.effectiveTo} required error={fieldErrors.effectiveTo} description="Today or earlier. For a resignation with notice, come back on the last working day.">
            <Input
              id={FIELD_IDS.effectiveTo}
              type="date"
              value={effectiveTo}
              min={hiredKey ?? undefined}
              max={todayKey}
              onChange={(event) => {
                setEffectiveTo(event.target.value);
                clearField("effectiveTo");
              }}
              required
            />
          </FormField>
          <FormField
            label="Note"
            htmlFor={FIELD_IDS.terminationReason}
            required={needsNote}
            description={needsNote ? "Required for this reason." : "Optional, e.g. the resignation letter reference."}
            error={fieldErrors.terminationReason}
          >
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
          <Button type="submit" form="end-employment-form" icon={Save} pending={isSubmitting} pendingLabel="Saving…" variant="destructive" data-testid="end-employment-submit">
            End employment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
