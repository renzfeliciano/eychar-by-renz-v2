"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormError, FormField, RequiredFieldsHint } from "@/components/shared/form-field";
import { useFieldErrors } from "@/lib/field-errors";
import { cn } from "@/lib/utils";

const FIELD_IDS = { reason: "reinstate-reason" } as const;

/**
 * Reverses an ending that was wrong: reopens the same employment, so the hire date and length of service continue,
 * with a required reason kept in its history. It is not for someone who really left and is coming back (that is a
 * rehire, a new employment). When final pay was paid out or a clearance is open, the server's reason is shown and
 * submit stays off.
 */
export function ReinstateDialog({
  organizationId,
  employeeId,
  employeeName,
  blockedReason,
}: {
  organizationId: string;
  employeeId: string;
  employeeName: string;
  /** The server's message when reinstating is blocked, or null. */
  blockedReason: string | null;
}) {
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
    if (!reason.trim()) return setFieldError("reason", "Enter why the employment is being reinstated.");

    setIsSubmitting(true);
    const response = await fetch(`/api/employees/${employeeId}/employment/reinstate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, reason: reason.trim() }),
    });
    setIsSubmitting(false);

    if (!response.ok) {
      setFromResponse(await response.json().catch(() => ({})), "The employee wasn't reinstated. Try again.");
      return;
    }

    setOpen(false);
    toast.success(`${employeeName} is back on the active roster`);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }))} data-testid="reinstate-button">
        <RotateCcw className="size-3.5" aria-hidden="true" />
        Reinstate
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reinstate {employeeName}</DialogTitle>
          <DialogDescription>
            Use this when the ending was recorded by mistake. The same employment reopens with the original hire date, and the ending stays in its history. If they really left and are coming back, hire them again instead.
          </DialogDescription>
        </DialogHeader>
        {blockedReason && <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">{blockedReason}</p>}
        <form id="reinstate-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <RequiredFieldsHint />
          <FormField label="Reason" htmlFor={FIELD_IDS.reason} required error={fieldErrors.reason} description="Why was the ending wrong?">
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
          <Button type="submit" form="reinstate-form" icon={RotateCcw} pending={isSubmitting} pendingLabel="Reinstating…" disabled={Boolean(blockedReason)} data-testid="reinstate-submit">
            Reinstate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
