"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormError, FormField } from "@/components/shared/form-field";
import { cn } from "@/lib/utils";

/**
 * HR's "recalculate" (attendance plan Phases 3 and 6): re-measures the stored
 * day results over a range, after a schedule, holiday or policy change for
 * days already recorded. Only days whose result changes are rewritten, each
 * audited. Needs attendance.recalculate.
 */
export function RecalculateDialog({ organizationId, date }: { organizationId: string; date: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(date);
  const [to, setTo] = useState(date);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setError(null);
    if (!from || !to) return setError("Pick the first and last day.");
    if (to < from) return setError("The last day can't be before the first.");
    setSaving(true);
    const response = await fetch("/api/attendance/recalculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, from, to }),
    });
    const body = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) return setError(body.error ?? "Couldn't recalculate attendance.");
    toast.success(body.changed ? `Recalculated: ${body.changed} of ${body.scanned} days changed` : `Recalculated: no change in ${body.scanned} days`);
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setFrom(date);
          setTo(date);
          setError(null);
        }
        setOpen(next);
      }}
    >
      <DialogTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }))} data-testid="attendance-recalculate-button">
        <RefreshCw className="size-3.5" />
        Recalculate
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Recalculate attendance</DialogTitle>
          <DialogDescription>
            Measures recorded days again against today&apos;s schedules, holidays and policies, e.g. after a schedule changed. Only days that come out different are updated, and each change is logged. Up to 62 days at a time.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="From" htmlFor="recalculate-from" required>
            <Input id="recalculate-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </FormField>
          <FormField label="To" htmlFor="recalculate-to" required>
            <Input id="recalculate-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </FormField>
        </div>
        <FormError message={error} />
        <DialogFooter>
          <Button onClick={submit} data-testid="attendance-recalculate-submit-button" icon={RefreshCw} pending={saving} pendingLabel="Recalculating…">
            Recalculate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
