"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormError, FormField, RequiredFieldsHint } from "@/components/shared/form-field";
import { OptionSelect, type SelectOption } from "@/components/shared/option-select";
import { WEEKDAY_NAMES } from "@/domains/payroll/payroll-labels";
import { localDateKey } from "@/lib/date-key";
import { cn } from "@/lib/utils";

const FREQUENCIES: SelectOption[] = [
  { id: "semi-monthly", label: "Semi-monthly" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
];
const TIMING: SelectOption[] = [
  { id: "every_cutoff", label: "Split across the month's cutoffs" },
  { id: "last_cutoff_of_month", label: "Whole month on the last cutoff" },
];
const EMPTY = {
  name: "",
  projectId: "",
  payFrequency: "semi-monthly",
  workDaysPerYear: "261",
  hoursPerDay: "8",
  finalPayDeadlineDays: "30",
  workWeekDays: [1, 2, 3, 4, 5],
  deductLateAndUndertime: true,
  contributionTiming: "every_cutoff",
  effectiveFrom: localDateKey(),
};

/** How pay is computed for the organization, or one project that works differently (e.g. a 6-day site). */
export function CreatePayrollPolicyDialog({ organizationId, projects }: { organizationId: string; projects: SelectOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function toggleDay(day: number) {
    const days = form.workWeekDays.includes(day) ? form.workWeekDays.filter((value) => value !== day) : [...form.workWeekDays, day].sort();
    // A 6-day week usually pays 313 days a year, a 5-day week 261.
    const suggested = days.length === 6 ? "313" : days.length === 5 ? "261" : form.workDaysPerYear;
    setForm({ ...form, workWeekDays: days, workDaysPerYear: suggested });
  }

  async function save() {
    setError(null);
    if (!form.name.trim()) return setError("Name the policy.");
    setSaving(true);
    const response = await fetch("/api/payroll-policies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId,
        name: form.name.trim(),
        projectId: form.projectId || undefined,
        payFrequency: form.payFrequency,
        workDaysPerYear: Number(form.workDaysPerYear),
        hoursPerDay: Number(form.hoursPerDay),
        finalPayDeadlineDays: Number(form.finalPayDeadlineDays),
        workWeekDays: form.workWeekDays,
        deductLateAndUndertime: form.deductLateAndUndertime,
        contributionTiming: form.contributionTiming,
        effectiveFrom: form.effectiveFrom,
      }),
    });
    const body = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) return setError(body.error ?? "Couldn't create the payroll policy.");
    toast.success("Payroll policy created");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setForm({ ...EMPTY, effectiveFrom: localDateKey() });
          setError(null);
        }
        setOpen(next);
      }}
    >
      <DialogTrigger className={cn(buttonVariants({ size: "sm" }))} data-testid="payroll-policies-create-button">
        <Plus className="size-3.5" />
        New policy
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New payroll policy</DialogTitle>
          <DialogDescription>A project policy overrides the organization&apos;s for that project&apos;s payroll. Tax and contribution rates live in rule versions.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <RequiredFieldsHint />
          <FormField label="Name" htmlFor="policy-name" required>
            <Input id="policy-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Site crews (6-day week)" />
          </FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <OptionSelect label="Applies to" value={form.projectId} onChange={(projectId) => setForm({ ...form, projectId })} options={projects} placeholder="Whole organization" />
            <OptionSelect label="Pay frequency" value={form.payFrequency} onChange={(value) => setForm({ ...form, payFrequency: value || "semi-monthly" })} options={FREQUENCIES} placeholder="Semi-monthly" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Workdays</span>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAY_NAMES.map((name, day) => (
                <button
                  key={name}
                  type="button"
                  aria-pressed={form.workWeekDays.includes(day)}
                  onClick={() => toggleDay(day)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-sm transition-[color,background-color,border-color] duration-150",
                    form.workWeekDays.includes(day) ? "border-primary bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:border-ring/50",
                  )}
                >
                  {name.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField label="Paid days a year" htmlFor="policy-days-per-year" required>
              <Input id="policy-days-per-year" type="number" min={1} max={366} value={form.workDaysPerYear} onChange={(event) => setForm({ ...form, workDaysPerYear: event.target.value })} placeholder="e.g. 261" />
            </FormField>
            <FormField label="Hours a day" htmlFor="policy-hours" required>
              <Input id="policy-hours" type="number" min={1} max={24} value={form.hoursPerDay} onChange={(event) => setForm({ ...form, hoursPerDay: event.target.value })} placeholder="e.g. 8" />
            </FormField>
            <FormField label="Effective from" htmlFor="policy-effective-from" required>
              <Input id="policy-effective-from" type="date" value={form.effectiveFrom} onChange={(event) => setForm({ ...form, effectiveFrom: event.target.value })} />
            </FormField>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">Paid days a year turn a monthly salary into a daily rate (monthly × 12 ÷ days) for absences and lates.</p>
          <FormField label="Final pay due (days after separation)" htmlFor="policy-final-pay-days" required>
            <Input
              id="policy-final-pay-days"
              type="number"
              min={1}
              max={365}
              value={form.finalPayDeadlineDays}
              onChange={(event) => setForm({ ...form, finalPayDeadlineDays: event.target.value })}
              placeholder="e.g. 30"
              className="w-32"
            />
          </FormField>
          <p className="-mt-2 text-xs text-muted-foreground">In the Philippines this is 30 days (DOLE Labor Advisory No. 06-2020). Final settlements count down to it.</p>
          <OptionSelect label="Government contributions" value={form.contributionTiming} onChange={(value) => setForm({ ...form, contributionTiming: value || "every_cutoff" })} options={TIMING} placeholder="Split across cutoffs" required />
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.deductLateAndUndertime} onCheckedChange={(checked) => setForm({ ...form, deductLateAndUndertime: checked === true })} />
            Deduct lates and undertime at the hourly rate
          </label>
          <FormError message={error} />
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={saving} data-testid="payroll-policies-create-submit-button">
            {saving && <Loader2 className="size-3.5 animate-spin" />}
            {saving ? "Creating…" : "Create policy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
