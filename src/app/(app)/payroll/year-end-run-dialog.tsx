"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Landmark, PlayCircle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormError, FormField, RequiredFieldsHint } from "@/components/shared/form-field";
import { OptionSelect, type SelectOption } from "@/components/shared/option-select";
import { cn } from "@/lib/utils";

/**
 * Prepares the year-end tax reconciliation for a calendar year (payroll plan Phase 4): each employee's
 * withholding is checked against the tax due on the whole year's pay, and the difference is refunded or
 * collected once HR approves the run.
 */
export function YearEndRunDialog({ organizationId, projects, currentYear }: { organizationId: string; projects: SelectOption[]; currentYear: number }) {
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
    const response = await fetch("/api/payroll-runs/year-end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, projectId: projectId || undefined, year: Number(year), payDate }),
    });
    const body = await response.json().catch(() => ({}));
    setIsSubmitting(false);
    if (!response.ok) {
      setError(body.error ?? "Couldn't prepare the year-end run.");
      return;
    }
    toast.success(`${body.run.runNumber} (year-end tax ${year}) prepared as a draft`);
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
      <DialogTrigger className={cn(buttonVariants({ size: "sm", variant: "outline" }))} data-testid="payroll-year-end-button">
        <Landmark className="size-3.5" />
        Year-end tax
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Year-end tax</DialogTitle>
          <DialogDescription>
            Works out each employee&apos;s tax on the whole year&apos;s pay, including any previous employer&apos;s, and compares it with what was withheld. Over-withheld tax is
            refunded; under-withheld tax is collected. Prepare it after the year&apos;s last payroll is approved. Employees who left during the year are settled in their final pay.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <RequiredFieldsHint />
          <OptionSelect label="Who's included" value={projectId} onChange={setProjectId} options={projects} placeholder="Everyone (all projects)" testId="payroll-year-end-scope" />
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Year" htmlFor="year-end-year" required>
              <Input id="year-end-year" inputMode="numeric" value={year} onChange={(event) => setYear(event.target.value.trim())} maxLength={4} />
            </FormField>
            <FormField label="Pay date" htmlFor="year-end-pay-date" required>
              <Input id="year-end-pay-date" type="date" value={payDate} onChange={(event) => setPayDate(event.target.value)} />
            </FormField>
          </div>
          <FormError message={error} />
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit} data-testid="payroll-year-end-submit" icon={PlayCircle} pending={isSubmitting} pendingLabel="Preparing…">
            Prepare draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
