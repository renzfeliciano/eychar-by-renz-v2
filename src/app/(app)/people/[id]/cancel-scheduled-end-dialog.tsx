"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarX } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormError, FormField, RequiredFieldsHint } from "@/components/shared/form-field";
import { useFieldErrors } from "@/lib/field-errors";
import { cn } from "@/lib/utils";

const FIELD_IDS = { reason: "cancel-scheduled-end-reason" } as const;

/**
 * Cancels an end scheduled for later (payroll plan Phase 5a slice 3), e.g. a resignation withdrawn during the
 * notice period. The employee simply stays on; the cancelled schedule is kept in the employment's history.
 */
export function CancelScheduledEndDialog({ organizationId, employeeId, employeeName, lastDayLabel }: { organizationId: string; employeeId: string; employeeName: string; lastDayLabel: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { fieldErrors, formError, setFromResponse, setFieldError, clearField, clear } = useFieldErrors({ fieldIds: FIELD_IDS });

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setReason("");
      clear();
    }
    setOpen(nextOpen);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clear();
    if (!reason.trim()) return setFieldError("reason", "Enter why the scheduled end is cancelled.");

    setIsSubmitting(true);
    const response = await fetch(`/api/employees/${employeeId}/employment/scheduled-end`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, reason: reason.trim() }),
    });
    setIsSubmitting(false);

    if (!response.ok) {
      setFromResponse(await response.json().catch(() => ({})), "The scheduled end wasn't cancelled. Try again.");
      return;
    }

    setOpen(false);
    toast.success(`${employeeName} stays on: the end on ${lastDayLabel} is cancelled`);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }))} data-testid="cancel-scheduled-end-button">
        <CalendarX className="size-3.5" aria-hidden="true" />
        Cancel scheduled end
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel the scheduled end</DialogTitle>
          <DialogDescription>
            {employeeName}&apos;s employment is set to end after {lastDayLabel}. Cancelling keeps them on; the cancelled schedule stays in the employment&apos;s history.
          </DialogDescription>
        </DialogHeader>
        <form id="cancel-scheduled-end-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <RequiredFieldsHint />
          <FormField label="Reason" htmlFor={FIELD_IDS.reason} required error={fieldErrors.reason} description="e.g. resignation withdrawn">
            <Textarea
              id={FIELD_IDS.reason}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                clearField("reason");
              }}
              maxLength={2000}
              rows={3}
              required
            />
          </FormField>
          {formError && <FormError message={formError} />}
        </form>
        <DialogFooter>
          <Button type="submit" form="cancel-scheduled-end-form" icon={CalendarX} pending={isSubmitting} pendingLabel="Cancelling…" data-testid="cancel-scheduled-end-submit">
            Cancel scheduled end
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
