"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Building2, Plus, Save, Trash2, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormError, FormField } from "@/components/shared/form-field";
import { formatPeso } from "@/domains/payroll/payroll-labels";
import { cn } from "@/lib/utils";

type Entry = {
  _id: string;
  year: number;
  employerName: string;
  employerTin?: string;
  periodFrom?: string;
  periodTo?: string;
  taxableCompensation: number;
  nonTaxableCompensation: number;
  taxWithheld: number;
  concurrent: boolean;
};

const blank = (year: number) => ({ year: String(year), employerName: "", employerTin: "", employerAddress: "", employerZipCode: "", periodFrom: "", periodTo: "", taxableCompensation: "", nonTaxableCompensation: "", taxWithheld: "", concurrent: false });

/**
 * An employee's pay from previous (or concurrent) employers, copied from their Form 2316 (payroll plan
 * Phase 4). The year-end tax adds it in; an entry also means the employee files their own return.
 */
export function PriorEmploymentDialog({ organizationId, employeeId, employeeName, canEdit, currentYear }: { organizationId: string; employeeId: string; employeeName: string; canEdit: boolean; currentYear: number }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [form, setForm] = useState(blank(currentYear));
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const response = await fetch(`/api/prior-employments?organizationId=${organizationId}&employeeId=${employeeId}`);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return setError(body.error ?? "Couldn't load previous employers.");
    setEntries(body.priorEmployments);
  }

  async function save() {
    setError(null);
    setSaving(true);
    const response = await fetch("/api/prior-employments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId,
        employeeId,
        year: Number(form.year),
        employerName: form.employerName,
        employerTin: form.employerTin || null,
        employerAddress: form.employerAddress || null,
        employerZipCode: form.employerZipCode || null,
        periodFrom: form.periodFrom || null,
        periodTo: form.periodTo || null,
        taxableCompensation: form.taxableCompensation || 0,
        nonTaxableCompensation: form.nonTaxableCompensation || 0,
        taxWithheld: form.taxWithheld || 0,
        concurrent: form.concurrent,
      }),
    });
    const body = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) return setError(body.error ?? "Couldn't save the previous employer.");
    toast.success("Previous employer added");
    setAdding(false);
    setForm(blank(currentYear));
    await load();
  }

  async function remove(entry: Entry) {
    const response = await fetch(`/api/prior-employments/${entry._id}?organizationId=${organizationId}`, { method: "DELETE" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return toast.error(body.error ?? "Couldn't remove the entry.");
    toast.success("Entry removed");
    await load();
  }

  const set = (patch: Partial<ReturnType<typeof blank>>) => setForm({ ...form, ...patch });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setEntries(null);
          setAdding(false);
          setError(null);
          void load();
        }
      }}
    >
      <DialogTrigger className={cn(buttonVariants({ size: "sm", variant: "ghost" }))} title="Previous employers (for year-end tax)" data-testid="prior-employment-button">
        <Building2 className="size-3.5" />
        <span className="sr-only">Previous employers of {employeeName}</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Previous employers: {employeeName}</DialogTitle>
          <DialogDescription>
            Pay and tax withheld by other employers in the same year, from their Form 2316. The year-end tax adds it in, and the employee then files their own return. Locked once that
            year&apos;s year-end run is approved.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {entries === null ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">None recorded.</p>
          ) : (
            <ul className="flex flex-col divide-y rounded-md border text-sm">
              {entries.map((entry) => (
                <li key={entry._id} className="flex items-start justify-between gap-3 px-3 py-2">
                  <div>
                    <p className="font-medium">
                      {entry.year} · {entry.employerName}
                      {entry.concurrent ? " (at the same time)" : ""}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      Taxable {formatPeso(entry.taxableCompensation)} · non-taxable {formatPeso(entry.nonTaxableCompensation)} · withheld {formatPeso(entry.taxWithheld)}
                    </p>
                  </div>
                  {canEdit && (
                    <Button size="icon-sm" variant="ghost" aria-label={`Remove ${entry.employerName}`} onClick={() => remove(entry)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canEdit && !adding && (
            <Button size="sm" variant="outline" className="w-fit" icon={Plus} onClick={() => setAdding(true)}>
              Add previous employer
            </Button>
          )}
          {adding && (
            <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
              <FormField label="Year" htmlFor="prior-year" required>
                <Input id="prior-year" inputMode="numeric" maxLength={4} value={form.year} onChange={(event) => set({ year: event.target.value.trim() })} />
              </FormField>
              <FormField label="Employer" htmlFor="prior-name" required>
                <Input id="prior-name" value={form.employerName} onChange={(event) => set({ employerName: event.target.value })} />
              </FormField>
              <FormField label="Employer TIN" htmlFor="prior-tin">
                <Input id="prior-tin" value={form.employerTin} onChange={(event) => set({ employerTin: event.target.value })} />
              </FormField>
              <FormField label="Employer ZIP code" htmlFor="prior-zip">
                <Input id="prior-zip" value={form.employerZipCode} onChange={(event) => set({ employerZipCode: event.target.value })} />
              </FormField>
              <div className="sm:col-span-2">
                <FormField label="Employer address" htmlFor="prior-address">
                  <Input id="prior-address" value={form.employerAddress} onChange={(event) => set({ employerAddress: event.target.value })} />
                </FormField>
              </div>
              <FormField label="From" htmlFor="prior-from">
                <Input id="prior-from" type="date" value={form.periodFrom} onChange={(event) => set({ periodFrom: event.target.value })} />
              </FormField>
              <FormField label="To" htmlFor="prior-to">
                <Input id="prior-to" type="date" value={form.periodTo} onChange={(event) => set({ periodTo: event.target.value })} />
              </FormField>
              <FormField label="Taxable compensation (₱)" htmlFor="prior-taxable" required>
                <Input id="prior-taxable" type="number" step="any" value={form.taxableCompensation} onChange={(event) => set({ taxableCompensation: event.target.value })} />
              </FormField>
              <FormField label="Non-taxable compensation (₱)" htmlFor="prior-non-taxable">
                <Input id="prior-non-taxable" type="number" step="any" value={form.nonTaxableCompensation} onChange={(event) => set({ nonTaxableCompensation: event.target.value })} />
              </FormField>
              <FormField label="Tax withheld (₱)" htmlFor="prior-withheld">
                <Input id="prior-withheld" type="number" step="any" value={form.taxWithheld} onChange={(event) => set({ taxWithheld: event.target.value })} />
              </FormField>
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <input type="checkbox" checked={form.concurrent} onChange={(event) => set({ concurrent: event.target.checked })} />
                Worked there at the same time
              </label>
              <div className="flex gap-2 sm:col-span-2">
                <Button size="sm" onClick={save} icon={Save} pending={saving} pendingLabel="Saving…" data-testid="prior-employment-save">
                  Save
                </Button>
                <Button size="sm" variant="ghost" icon={X} onClick={() => setAdding(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
          <FormError message={error} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
