"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, Save } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormError, FormField, RequiredFieldsHint } from "@/components/shared/form-field";
import { useFieldErrors } from "@/lib/field-errors";
import { localDateKey } from "@/lib/date-key";
import { cn } from "@/lib/utils";

type Allowance = { name: string; amount: string; basis: "monthly" | "daily"; taxable: boolean };
export type CompensationTerms = {
  rateType: "monthly" | "daily";
  rate: number;
  allowances: { name: string; amount: number; basis: "monthly" | "daily"; taxable: boolean }[];
  minimumWageEarner: boolean;
};

type Props = {
  organizationId: string;
  employeeId: string;
  employeeName: string;
  /** The terms in effect today; absent means this sets the first pay terms. */
  current?: CompensationTerms;
};

/** API field → the control it's about, for field-level errors (see useFieldErrors). */
const COMPENSATION_FIELD_IDS = {
  rate: "compensation-rate",
  effectiveFrom: "compensation-effective-from",
  reason: "compensation-reason",
} as const;

/** Sets an employee's first pay terms, or revises them from a date (the old terms close the day before). */
export function CompensationFormDialog({ organizationId, employeeId, employeeName, current }: Props) {
  const router = useRouter();
  const isRevision = Boolean(current);
  const initial = () => ({
    rateType: current?.rateType ?? ("monthly" as const),
    rate: current ? String(current.rate) : "",
    allowances: (current?.allowances ?? []).map((allowance) => ({ ...allowance, amount: String(allowance.amount) })) as Allowance[],
    minimumWageEarner: current?.minimumWageEarner ?? false,
    effectiveFrom: localDateKey(),
    reason: "",
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initial);
  const { fieldErrors, formError: error, setFormError: setError, setFieldError, setFromResponse } = useFieldErrors({ fieldIds: COMPENSATION_FIELD_IDS });
  const [saving, setSaving] = useState(false);

  function updateAllowance(index: number, patch: Partial<Allowance>) {
    setForm({ ...form, allowances: form.allowances.map((allowance, i) => (i === index ? { ...allowance, ...patch } : allowance)) });
  }

  async function save() {
    setError(null);
    if (!(Number(form.rate) > 0)) return setFieldError("rate", `Enter the ${form.rateType === "daily" ? "daily rate" : "monthly salary"}.`);
    if (form.allowances.some((allowance) => !allowance.name.trim() || !(Number(allowance.amount) >= 0))) return setError("Name each allowance and give it an amount.");
    setSaving(true);
    const payload = {
      organizationId,
      ...(isRevision ? {} : { employeeId }),
      rateType: form.rateType,
      rate: Number(form.rate),
      allowances: form.allowances.map((allowance) => ({ name: allowance.name.trim(), amount: Number(allowance.amount), basis: allowance.basis, taxable: allowance.taxable })),
      minimumWageEarner: form.minimumWageEarner,
      effectiveFrom: form.effectiveFrom,
      reason: form.reason.trim() || undefined,
    };
    const response = await fetch(isRevision ? `/api/compensation/${employeeId}` : "/api/compensation", {
      method: isRevision ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) return setFromResponse(body, "Couldn't save the pay terms.");
    toast.success(isRevision ? `${employeeName}'s pay terms revised` : `Pay terms set for ${employeeName}`);
    setOpen(false);
    router.refresh();
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
      <DialogTrigger
        className={cn(buttonVariants({ variant: isRevision ? "ghost" : "outline", size: "sm" }))}
        data-testid={isRevision ? `compensation-revise-${employeeId}` : `compensation-set-${employeeId}`}
      >
        {isRevision ? <Pencil className="size-3.5" /> : <Plus className="size-3.5" />}
        {isRevision ? "Revise" : "Set pay terms"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isRevision ? `Revise ${employeeName}'s pay` : `Pay terms for ${employeeName}`}</DialogTitle>
          <DialogDescription>
            {isRevision
              ? "The new terms apply from the date you pick; the current ones end the day before. Payroll already computed isn't changed."
              : "How this employee is paid. Changes later are made as dated revisions, so past payroll stays as computed."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <RequiredFieldsHint />
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Paid</span>
            <div role="radiogroup" aria-label="Pay basis" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              {(["monthly", "daily"] as const).map((rateType) => (
                <button
                  key={rateType}
                  type="button"
                  role="radio"
                  aria-checked={form.rateType === rateType}
                  onClick={() => setForm({ ...form, rateType })}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-[color,background-color,box-shadow] duration-150",
                    form.rateType === rateType ? "bg-background text-foreground shadow-[var(--shadow-soft)]" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {rateType === "monthly" ? "Monthly salary" : "Daily rate"}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label={form.rateType === "monthly" ? "Monthly salary (₱)" : "Daily rate (₱)"} htmlFor="compensation-rate" error={fieldErrors.rate} required>
              <Input
                id="compensation-rate"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={form.rate}
                onChange={(event) => setForm({ ...form, rate: event.target.value })}
                placeholder={form.rateType === "monthly" ? "e.g. 25000" : "e.g. 695"}
              />
            </FormField>
            <FormField label={isRevision ? "Effective from" : "Starting"} htmlFor="compensation-effective-from" error={fieldErrors.effectiveFrom} required>
              <Input id="compensation-effective-from" type="date" value={form.effectiveFrom} onChange={(event) => setForm({ ...form, effectiveFrom: event.target.value })} />
            </FormField>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={form.minimumWageEarner} onCheckedChange={(checked) => setForm({ ...form, minimumWageEarner: checked === true })} className="mt-0.5" />
            <span>
              Minimum wage earner
              <span className="block text-xs text-muted-foreground">Exempt from withholding tax on their pay.</span>
            </span>
          </label>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Allowances</span>
            {form.allowances.map((allowance, index) => (
              <div key={index} className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
                <div className="grid grid-cols-[1fr_7rem_auto] items-end gap-2">
                  <FormField label="Name">
                    <Input value={allowance.name} onChange={(event) => updateAllowance(index, { name: event.target.value })} placeholder="e.g. Rice subsidy" />
                  </FormField>
                  <FormField label="Amount (₱)">
                    <Input type="number" min={0} step="0.01" value={allowance.amount} onChange={(event) => updateAllowance(index, { amount: event.target.value })} placeholder="e.g. 2000" />
                  </FormField>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="mb-0.5 text-muted-foreground hover:text-destructive"
                    aria-label={`Remove ${allowance.name || "allowance"}`}
                    onClick={() => setForm({ ...form, allowances: form.allowances.filter((_, i) => i !== index) })}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <div role="radiogroup" aria-label="Allowance basis" className="flex gap-1 rounded-md bg-muted p-0.5">
                    {(["monthly", "daily"] as const).map((basis) => (
                      <button
                        key={basis}
                        type="button"
                        role="radio"
                        aria-checked={allowance.basis === basis}
                        onClick={() => updateAllowance(index, { basis })}
                        className={cn("rounded px-2 py-0.5 text-xs font-medium", allowance.basis === basis ? "bg-background shadow-[var(--shadow-soft)]" : "text-muted-foreground")}
                      >
                        {basis === "monthly" ? "Per month" : "Per day worked"}
                      </button>
                    ))}
                  </div>
                  <label className="flex items-center gap-1.5">
                    <Checkbox checked={allowance.taxable} onCheckedChange={(checked) => updateAllowance(index, { taxable: checked === true })} />
                    Taxable
                  </label>
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit border-dashed"
              onClick={() => setForm({ ...form, allowances: [...form.allowances, { name: "", amount: "", basis: "monthly", taxable: false }] })}
            >
              <Plus className="size-3.5" />
              Add allowance
            </Button>
          </div>

          <FormField label="Reason" htmlFor="compensation-reason" error={fieldErrors.reason}>
            <Input id="compensation-reason" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder={isRevision ? "e.g. Annual merit increase" : "e.g. Hired as site engineer"} />
          </FormField>
          <FormError message={error} />
        </div>

        <DialogFooter>
          <Button onClick={save} data-testid="compensation-save" icon={Save} pending={saving} pendingLabel="Saving…">
            {isRevision ? "Save revision" : "Save pay terms"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
