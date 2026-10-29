"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, MailCheck } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormError, FormField, RequiredFieldsHint } from "@/components/shared/form-field";
import { useFieldErrors } from "@/lib/field-errors";
import { cn } from "@/lib/utils";

type Outcome = "sent" | "completed";

const FIELD_IDS = { actionDate: "follow-up-date", sentTo: "follow-up-sent-to", remarks: "follow-up-remarks" } as const;

/**
 * "Mark sent": HR records that a probation evaluation went out by email or
 * on paper (to whom, when), or that it's complete. The row leaves the
 * dashboard's Compliance list, with Undo on the toast; the record stays on
 * the employee's Job & history tab (ADR-053).
 */
export function EvaluationFollowUpDialog({
  organizationId,
  employeeId,
  employeeName,
  dueKey,
  todayKey,
}: {
  organizationId: string;
  employeeId: string;
  employeeName: string;
  /** The regularization date the row is about ("YYYY-MM-DD"). */
  dueKey: string;
  todayKey: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>("sent");
  const [actionDate, setActionDate] = useState(todayKey);
  const [sentTo, setSentTo] = useState("");
  const [remarks, setRemarks] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { fieldErrors, formError, setFromResponse, setFieldError, clear } = useFieldErrors({ fieldIds: FIELD_IDS });

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setOutcome("sent");
      setActionDate(todayKey);
      setSentTo("");
      setRemarks("");
      clear();
    }
    setOpen(nextOpen);
  }

  async function undo(id: string) {
    const response = await fetch(`/api/evaluation-follow-ups/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      toast.error(typeof body.error === "string" ? body.error : "Couldn't undo it. Try again.");
      return;
    }
    toast.success(`${employeeName}'s evaluation is back on the list`);
    router.refresh();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clear();
    if (!actionDate) return setFieldError("actionDate", outcome === "sent" ? "Enter the date it was sent." : "Enter the date it was completed.");

    setIsSubmitting(true);
    const response = await fetch("/api/evaluation-follow-ups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId,
        employeeId,
        dueKey,
        outcome,
        actionDate,
        sentTo: outcome === "sent" ? sentTo.trim() || undefined : undefined,
        remarks: remarks.trim() || undefined,
      }),
    });
    setIsSubmitting(false);

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setFromResponse(body, "It wasn't saved. Try again.");
      return;
    }

    setOpen(false);
    const id: string | undefined = body.followUp?.id;
    toast.success(outcome === "sent" ? `Marked ${employeeName}'s evaluation as sent` : `Marked ${employeeName}'s evaluation as completed`, {
      description: "It's off the list. The note stays on their Job & history tab.",
      ...(id ? { action: { label: "Undo", onClick: () => void undo(id) } } : {}),
    });
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger className={cn(buttonVariants({ variant: "ghost", size: "sm" }))} data-testid="evaluation-follow-up-button" aria-label={`Mark sent: ${employeeName}'s evaluation`}>
        <MailCheck aria-hidden="true" />
        Mark sent
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{employeeName}&apos;s evaluation</DialogTitle>
          <DialogDescription>Record an evaluation handled outside PCAS HRIS. It comes off the Compliance list; you can undo it right after.</DialogDescription>
        </DialogHeader>
        <form id="evaluation-follow-up-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <RequiredFieldsHint />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">What happened</legend>
            {(
              [
                ["sent", "Sent to the evaluator", "By email or on paper; waiting for it to come back."],
                ["completed", "Evaluation completed", "The evaluation is done and on file."],
              ] as const
            ).map(([value, label, hint]) => (
              <label
                key={value}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors",
                  outcome === value ? "border-primary bg-accent/40" : "hover:bg-accent/30",
                )}
              >
                <input type="radio" name="follow-up-outcome" value={value} checked={outcome === value} onChange={() => setOutcome(value)} className="mt-0.5 accent-primary" />
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium">{label}</span>
                  <span className="text-xs text-muted-foreground">{hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label={outcome === "sent" ? "Sent on" : "Completed on"} htmlFor={FIELD_IDS.actionDate} required error={fieldErrors.actionDate}>
              <Input id={FIELD_IDS.actionDate} type="date" value={actionDate} max={todayKey} onChange={(event) => setActionDate(event.target.value)} required />
            </FormField>
            {outcome === "sent" && (
              <FormField label="Sent to" htmlFor={FIELD_IDS.sentTo} error={fieldErrors.sentTo}>
                <Input id={FIELD_IDS.sentTo} value={sentTo} onChange={(event) => setSentTo(event.target.value)} maxLength={200} placeholder="e.g. Engr. Santos" />
              </FormField>
            )}
          </div>
          <FormField label="Remarks" htmlFor={FIELD_IDS.remarks} description="Optional, e.g. how it was sent or who has it now." error={fieldErrors.remarks}>
            <Textarea id={FIELD_IDS.remarks} value={remarks} onChange={(event) => setRemarks(event.target.value)} maxLength={1000} rows={3} placeholder="e.g. Sent via email on October 1, 2026" />
          </FormField>
          {formError && <FormError message={formError} />}
        </form>
        <DialogFooter>
          <Button type="submit" form="evaluation-follow-up-form" icon={Check} pending={isSubmitting} pendingLabel="Saving…" data-testid="evaluation-follow-up-submit">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
