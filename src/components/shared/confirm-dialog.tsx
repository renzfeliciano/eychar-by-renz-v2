"use client";

import { useState, cloneElement, type ReactElement } from "react";
import { TriangleAlert } from "lucide-react";
import { iconForAction } from "@/components/ui/action-icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormError } from "@/components/shared/form-field";

/**
 * The confirmation step for any destructive/state-changing action (cancel,
 * deactivate, terminate, revoke) — the trigger button opens this instead of
 * firing immediately, and a failed `onConfirm` keeps the dialog open with
 * the error shown rather than failing silently.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  confirmLoadingLabel,
  cancelLabel = "Keep it",
  variant = "destructive",
  onConfirm,
  testId,
}: {
  trigger: ReactElement;
  title: string;
  description: string;
  confirmLabel: string;
  confirmLoadingLabel: string;
  cancelLabel?: string;
  variant?: "destructive" | "default";
  onConfirm: () => Promise<void>;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(nextOpen: boolean) {
    if (isSubmitting) return;
    if (nextOpen) setError(null);
    setOpen(nextOpen);
  }

  async function handleConfirm() {
    setError(null);
    setIsSubmitting(true);
    try {
      await onConfirm();
      setIsSubmitting(false);
      setOpen(false);
    } catch (err) {
      setIsSubmitting(false);
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={cloneElement(trigger, { "data-testid": testId } as object)} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="flex-row items-start gap-3 pr-10">
          <div className={`mt-0.5 shrink-0 ${variant === "destructive" ? "text-destructive" : "text-primary"}`}>
            <TriangleAlert className="size-5" aria-hidden="true" />
          </div>
          <div className="flex flex-col gap-1.5">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </div>
        </DialogHeader>
        {error && <FormError message={error} />}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting} icon={iconForAction(cancelLabel)}>
            {cancelLabel}
          </Button>
          <Button type="button" variant={variant} onClick={handleConfirm} icon={iconForAction(confirmLabel)} pending={isSubmitting} pendingLabel={confirmLoadingLabel} data-testid={testId ? `${testId}-confirm` : undefined}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
