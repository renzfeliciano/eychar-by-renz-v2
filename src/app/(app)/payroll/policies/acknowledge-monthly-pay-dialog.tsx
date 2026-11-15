"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormError } from "@/components/shared/form-field";
import { cn } from "@/lib/utils";
import { MonthlyPayNotice } from "../monthly-pay-notice";

/**
 * A monthly policy created before the acknowledgement existed (payroll plan Phase 6): HR ticks it here and the
 * dashboard stops listing it as a risk. Pay is unchanged.
 */
export function AcknowledgeMonthlyPayDialog({ organizationId, policyId, policyName }: { organizationId: string; policyId: string; policyName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setError(null);
    if (!checked) return setError("Tick the acknowledgement first.");
    setSaving(true);
    const response = await fetch(`/api/payroll-policies/${policyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, acknowledgeMonthlyPay: true }),
    });
    const body = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) return setError(body.error ?? "Couldn't record the acknowledgement.");
    toast.success("Monthly pay acknowledged");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setChecked(false);
          setError(null);
        }
        setOpen(next);
      }}
    >
      <DialogTrigger className={cn(buttonVariants({ size: "xs", variant: "outline" }), "w-fit")} data-testid={`policy-acknowledge-monthly-${policyId}`}>
        Acknowledge
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Acknowledge monthly pay</DialogTitle>
          <DialogDescription>{policyName} pays monthly. Pay stays as it is; this records that HR chose it knowing the risk.</DialogDescription>
        </DialogHeader>
        <MonthlyPayNotice checked={checked} onCheckedChange={setChecked} testId="acknowledge-monthly-notice" />
        <FormError message={error} />
        <DialogFooter>
          <Button onClick={save} icon={Check} pending={saving} pendingLabel="Saving…" data-testid="acknowledge-monthly-save">
            Record acknowledgement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
