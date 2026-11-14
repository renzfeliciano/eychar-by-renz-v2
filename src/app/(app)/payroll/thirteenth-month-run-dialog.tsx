"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Gift, PlayCircle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormError, FormField, RequiredFieldsHint } from "@/components/shared/form-field";
import { OptionSelect, type SelectOption } from "@/components/shared/option-select";
import { cn } from "@/lib/utils";

/**
 * Prepares the 13th-month run for a calendar year (PD 851; payroll plan Phase 3). The amounts come from
 * the year's approved and released regular payroll, with the rest of December estimated.
 */
export function ThirteenthMonthRunDialog({ organizationId, projects, currentYear }: { organizationId: string; projects: SelectOption[]; currentYear: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [year, setYear] = useState(String(currentYear));
  const [payDate, setPayDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    if (!/^\d{4}$/.test(year) || !payDate) {
      setError("Enter the year and the pay date.");
      return;
    }
    setIsSubmitting(true);
    const response = await fetch("/api/payroll-runs/thirteenth-month", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, projectId: projectId || undefined, year: Number(year), payDate }),
    });
    const body = await response.json().catch(() => ({}));
    setIsSubmitting(false);
    if (!response.ok) {
      setError(body.error ?? "Couldn't prepare the 13th-month run.");
      return;
    }
    toast.success(`${body.run.runNumber} (13th month ${year}) prepared as a draft`);
    setOpen(false);
    router.push(`/payroll/${body.run._id}`);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setProjectId("");
          setYear(String(currentYear));
          setPayDate("");
          setError(null);
        }
        setOpen(next);
      }}
    >
      <DialogTrigger className={cn(buttonVariants({ size: "sm", variant: "outline" }))} data-testid="payroll-thirteenth-month-button">
        <Gift className="size-3.5" />
        13th month
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>13th-month pay</DialogTitle>
          <DialogDescription>
            One twelfth of each employee&apos;s basic pay earned in the year (less unpaid absences and tardiness), from approved and released payroll. Any part of December not yet
            approved is estimated, and the January payroll settles the difference. Due on or before December 24.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <RequiredFieldsHint />
          <OptionSelect label="Who's paid" value={projectId} onChange={setProjectId} options={projects} placeholder="Everyone (all projects)" testId="payroll-thirteenth-month-scope" />
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Year" htmlFor="thirteenth-month-year" required>
              <Input id="thirteenth-month-year" inputMode="numeric" value={year} onChange={(event) => setYear(event.target.value.trim())} maxLength={4} />
            </FormField>
            <FormField label="Pay date" htmlFor="thirteenth-month-pay-date" required>
              <Input id="thirteenth-month-pay-date" type="date" value={payDate} onChange={(event) => setPayDate(event.target.value)} />
            </FormField>
          </div>
          <FormError message={error} />
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit} data-testid="payroll-thirteenth-month-submit" icon={PlayCircle} pending={isSubmitting} pendingLabel="Preparing…">
            Prepare draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
