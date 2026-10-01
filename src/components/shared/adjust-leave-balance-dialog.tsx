"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Pencil, Loader2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormField, FormError, RequiredFieldsHint } from "@/components/shared/form-field";
import { cn } from "@/lib/utils";

export function AdjustLeaveBalanceDialog({
  organizationId,
  balanceId,
  leaveTypeLabel,
  currentAdjustmentDays,
}: {
  organizationId: string;
  balanceId: string;
  leaveTypeLabel: string;
  currentAdjustmentDays: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [adjustmentDays, setAdjustmentDays] = useState(currentAdjustmentDays.toFixed(2));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch(`/api/leave-balances/${balanceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, adjustmentDays: Number(adjustmentDays) }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to adjust leave balance.");
      return;
    }

    setOpen(false);
    toast.success("Leave balance adjusted");
    router.refresh();
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setAdjustmentDays(currentAdjustmentDays.toFixed(2));
      setError(null);
    }
    setOpen(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        className={cn(buttonVariants({ size: "sm", variant: "ghost" }))}
        aria-label={`Adjust ${leaveTypeLabel} balance`}
        data-testid="adjust-leave-balance-button"
      >
        <Pencil className="size-3.5" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust {leaveTypeLabel} balance</DialogTitle>
        </DialogHeader>
        <form id="adjust-leave-balance-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
          <RequiredFieldsHint />
          <FormField label="Adjustment days" htmlFor="adjust-leave-balance-days" required>
            <Input
              id="adjust-leave-balance-days"
              type="number"
              min={-999.99}
              max={999.99}
              step={0.01}
              value={adjustmentDays}
              onChange={(event) => setAdjustmentDays(event.target.value)}
              placeholder="e.g. 2.00 or -1.50"
              required
            />
          </FormField>
          <p className="text-xs text-muted-foreground">
            Added on top of (or subtracted from) the entitled days — e.g. a carry-over credit or a correction. This replaces the
            current adjustment, it doesn&apos;t add to it.
          </p>
          <FormError message={error} />
        </form>
        <DialogFooter>
          <Button type="submit" form="adjust-leave-balance-form" disabled={isSubmitting} data-testid="adjust-leave-balance-submit-button">
            {isSubmitting && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
            {isSubmitting ? "Saving…" : "Save adjustment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
