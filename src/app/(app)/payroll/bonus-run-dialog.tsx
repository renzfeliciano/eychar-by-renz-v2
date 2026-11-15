"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PartyPopper, PlayCircle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormError, FormField, RequiredFieldsHint } from "@/components/shared/form-field";
import { OptionSelect, type SelectOption } from "@/components/shared/option-select";
import { BONUS_BASIS_LABELS, bonusAmount, type BonusBasis } from "@/domains/payroll/engine/bonus";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

const BASIS_OPTIONS: SelectOption[] = (Object.keys(BONUS_BASIS_LABELS) as BonusBasis[]).map((basis) => ({ id: basis, label: BONUS_BASIS_LABELS[basis] }));

/** The value field's label and example for each basis. */
const VALUE_FIELD: Record<BonusBasis, { label: string; placeholder: string; step: string }> = {
  fixed: { label: "Amount per employee (₱)", placeholder: "e.g. 5000", step: "0.01" },
  percent_of_monthly: { label: "Percent of monthly salary (%)", placeholder: "e.g. 50", step: "0.01" },
  months_of_pay: { label: "Months of pay per employee", placeholder: "e.g. 0.5", step: "0.01" },
  days_of_pay: { label: "Days of pay per employee", placeholder: "e.g. 15", step: "0.5" },
};

// For the worked example only: a ₱25,000 monthly salary at 261 workdays a year.
const SAMPLE = { monthlyBasic: 25000, dailyRate: Math.round(((25000 * 12) / 261) * 100) / 100 };

/**
 * Prepares a bonus run (e.g. a Christmas bonus). HR names it and picks how each amount is worked out: a
 * fixed amount, a percentage of monthly salary, months of pay or days of pay, optionally prorated by months
 * worked this year and limited to a minimum service. Amounts can be changed or removed per employee on the draft.
 */
export function BonusRunDialog({ organizationId, projects, currentYear }: { organizationId: string; projects: SelectOption[]; currentYear: number }) {
  const router = useRouter();
  const initial = () => ({ label: "Christmas bonus", projectId: "", year: String(currentYear), payDate: "", basis: "fixed" as BonusBasis, value: "", prorate: false, minServiceMonths: "" });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const value = Number(form.value);
  const field = VALUE_FIELD[form.basis];
  const example =
    value > 0 && form.basis !== "fixed"
      ? `${formatMoney(SAMPLE.monthlyBasic)} a month → ${formatMoney(bonusAmount({ basis: form.basis, value, ...SAMPLE }))}${form.prorate ? " for a full year" : ""}`
      : null;

  async function handleSubmit() {
    setError(null);
    if (!(value > 0) || !form.payDate) return setError("Enter the amount and the pay date.");
    if (!/^\d{4}$/.test(form.year)) return setError("Enter the year the bonus is for.");
    if (!form.label.trim()) return setError("Name the bonus.");
    setIsSubmitting(true);
    const response = await fetch("/api/payroll-runs/bonus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId,
        projectId: form.projectId || undefined,
        label: form.label.trim(),
        year: Number(form.year),
        payDate: form.payDate,
        basis: form.basis,
        value,
        prorate: form.prorate,
        minServiceMonths: Number(form.minServiceMonths) || 0,
      }),
    });
    const body = await response.json().catch(() => ({}));
    setIsSubmitting(false);
    if (!response.ok) return setError(body.error ?? "Couldn't prepare the bonus run.");
    toast.success(`${body.run.runNumber} (${form.label.trim()}) prepared as a draft`);
    setOpen(false);
    router.push(`/payroll/${body.run._id}`);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setForm(initial());
          setError(null);
        }
        setOpen(next);
      }}
    >
      <DialogTrigger className={cn(buttonVariants({ size: "sm", variant: "outline" }))} data-testid="payroll-bonus-button">
        <PartyPopper className="size-3.5" />
        Bonus
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Bonus run</DialogTitle>
          <DialogDescription>
            A Christmas or other bonus for everyone on staff on the pay date. You can change or remove any one person&apos;s amount on the draft before submitting. Not taxed in the run: with
            13th-month pay it is tax-free up to the yearly limit, and the year-end adjustment taxes any excess.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <RequiredFieldsHint />
          <FormField label="Bonus name" htmlFor="bonus-label" required>
            <Input id="bonus-label" value={form.label} maxLength={60} onChange={(event) => setForm({ ...form, label: event.target.value })} />
          </FormField>
          <OptionSelect label="Who's paid" value={form.projectId} onChange={(projectId) => setForm({ ...form, projectId })} options={projects} placeholder="Everyone (all projects)" testId="payroll-bonus-scope" />
          <div className="grid gap-3 sm:grid-cols-2">
            <OptionSelect label="How much" value={form.basis} onChange={(basis) => setForm({ ...form, basis: (basis || "fixed") as BonusBasis })} options={BASIS_OPTIONS} testId="payroll-bonus-basis" />
            <FormField label={field.label} htmlFor="bonus-value" required>
              <Input id="bonus-value" type="number" min={0} step={field.step} inputMode="decimal" value={form.value} placeholder={field.placeholder} onChange={(event) => setForm({ ...form, value: event.target.value })} />
            </FormField>
          </div>
          {example && (
            <p className="text-xs text-muted-foreground" data-testid="payroll-bonus-example">
              Example: {example}
            </p>
          )}
          <label className="flex items-start gap-2 text-sm">
            <Checkbox id="bonus-prorate" checked={form.prorate} onCheckedChange={(checked) => setForm({ ...form, prorate: checked === true })} className="mt-0.5" />
            <span>
              Prorate by months worked this year
              <span className="block text-xs text-muted-foreground">Someone hired in July gets half.</span>
            </span>
          </label>
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Minimum months of service" htmlFor="bonus-min-service" description="Blank for none">
              <Input id="bonus-min-service" type="number" min={0} step={1} inputMode="numeric" value={form.minServiceMonths} onChange={(event) => setForm({ ...form, minServiceMonths: event.target.value })} />
            </FormField>
            <FormField label="Year" htmlFor="bonus-year" required>
              <Input id="bonus-year" inputMode="numeric" value={form.year} maxLength={4} onChange={(event) => setForm({ ...form, year: event.target.value.trim() })} />
            </FormField>
            <FormField label="Pay date" htmlFor="bonus-pay-date" required>
              <Input id="bonus-pay-date" type="date" value={form.payDate} onChange={(event) => setForm({ ...form, payDate: event.target.value })} />
            </FormField>
          </div>
          <FormError message={error} />
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit} data-testid="payroll-bonus-submit" icon={PlayCircle} pending={isSubmitting} pendingLabel="Preparing…">
            Prepare draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
