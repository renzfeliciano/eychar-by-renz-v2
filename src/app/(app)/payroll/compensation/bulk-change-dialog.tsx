"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Layers, Loader2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormError, FormField, RequiredFieldsHint } from "@/components/shared/form-field";
import { OptionSelect, type SelectOption } from "@/components/shared/option-select";
import { formatPeso } from "@/domains/payroll/payroll-labels";
import { formatDateKey, localDateKey } from "@/lib/date-key";
import { cn } from "@/lib/utils";

type ChangeType = "raise_to_minimum" | "increase_percent" | "increase_amount" | "set_rate";
type PreviewRow = {
  employeeId: string;
  employeeNumber: string;
  name: string;
  rateType: "monthly" | "daily" | null;
  currentRate: number | null;
  newRate: number | null;
  status: "change" | "unchanged" | "skipped";
  note?: string;
};

const CHANGE_TYPES: SelectOption[] = [
  { id: "raise_to_minimum", label: "Raise to a minimum rate (wage order)" },
  { id: "increase_percent", label: "Increase by a percentage" },
  { id: "increase_amount", label: "Increase by an amount" },
  { id: "set_rate", label: "Set everyone to one rate" },
];
const RATE_TYPES: SelectOption[] = [
  { id: "daily", label: "Daily-rated only" },
  { id: "monthly", label: "Monthly-rated only" },
];

/**
 * A pay change for many people at once (a regional wage order for a
 * project's crew, an across-the-board increase), effective on a date.
 * Always previewed first; HR can untick anyone before applying. Applied as
 * one batch of dated revisions, audited together.
 */
export function BulkChangeDialog({ organizationId, projects }: { organizationId: string; projects: SelectOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ projectId: "", rateType: "daily", changeType: "raise_to_minimum" as ChangeType, value: "", effectiveFrom: localDateKey(), reason: "" });
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null);

  const request = (mode: "preview" | "apply", employeeIds?: string[]) =>
    fetch("/api/compensation/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode,
        organizationId,
        projectId: form.projectId || undefined,
        rateType: form.rateType || undefined,
        changeType: form.changeType,
        value: Number(form.value),
        effectiveFrom: form.effectiveFrom,
        reason: form.reason.trim(),
        employeeIds,
      }),
    });

  async function runPreview() {
    setError(null);
    if (!(Number(form.value) > 0)) return setError("Enter the rate, amount or percentage.");
    if (form.reason.trim().length < 3) return setError("Give a reason, e.g. the wage order number.");
    setBusy("preview");
    const response = await request("preview");
    const body = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) return setError(body.error ?? "Couldn't preview the change.");
    const rows: PreviewRow[] = body.rows;
    setPreview(rows);
    setPicked(new Set(rows.filter((row) => row.status === "change").map((row) => row.employeeId)));
  }

  async function apply() {
    setError(null);
    setBusy("apply");
    const response = await request("apply", [...picked]);
    const body = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) return setError(body.error ?? "Couldn't apply the change.");
    toast.success(`Pay updated for ${body.result.applied} employee${body.result.applied === 1 ? "" : "s"} from ${formatDateKey(form.effectiveFrom)}`);
    setOpen(false);
    router.refresh();
  }

  const valueLabel = form.changeType === "increase_percent" ? "Percentage (%)" : form.changeType === "increase_amount" ? "Increase (₱)" : form.changeType === "set_rate" ? "New rate (₱)" : "Minimum rate (₱)";
  const changing = preview?.filter((row) => row.status === "change") ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setPreview(null);
          setError(null);
        }
        setOpen(next);
      }}
    >
      <DialogTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }))} data-testid="compensation-bulk-change">
        <Layers className="size-3.5" />
        Bulk change
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk pay change</DialogTitle>
          <DialogDescription>Change pay for a project&apos;s crew or everyone, effective on a date. You&apos;ll see who changes before anything is saved.</DialogDescription>
        </DialogHeader>

        {!preview ? (
          <div className="flex flex-col gap-4">
            <RequiredFieldsHint />
            <div className="grid gap-3 sm:grid-cols-2">
              <OptionSelect label="Who" value={form.projectId} onChange={(projectId) => setForm({ ...form, projectId })} options={projects} placeholder="Everyone (all projects)" />
              <OptionSelect label="Pay basis" value={form.rateType} onChange={(rateType) => setForm({ ...form, rateType })} options={RATE_TYPES} placeholder="Monthly and daily" />
            </div>
            <OptionSelect label="Change" value={form.changeType} onChange={(value) => setForm({ ...form, changeType: (value || "raise_to_minimum") as ChangeType })} options={CHANGE_TYPES} placeholder="Raise to a minimum rate" required />
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label={valueLabel} htmlFor="bulk-value" required>
                <Input id="bulk-value" type="number" min={0} step="0.01" value={form.value} onChange={(event) => setForm({ ...form, value: event.target.value })} placeholder={form.changeType === "increase_percent" ? "e.g. 5" : "e.g. 695"} />
              </FormField>
              <FormField label="Effective from" htmlFor="bulk-effective-from" required>
                <Input id="bulk-effective-from" type="date" value={form.effectiveFrom} onChange={(event) => setForm({ ...form, effectiveFrom: event.target.value })} />
              </FormField>
            </div>
            <FormField label="Reason" htmlFor="bulk-reason" required>
              <Input id="bulk-reason" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="e.g. Wage Order RB-IV-A-21" />
            </FormField>
            <FormError message={error} />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              <span className="font-medium">{picked.size}</span> of {changing.length} employees will change from {formatDateKey(form.effectiveFrom)}.
              {preview.length > changing.length && <span className="text-muted-foreground"> Others are listed for reference.</span>}
            </p>
            <div className="max-h-80 overflow-y-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
                  <tr>
                    <th className="w-8 px-3 py-2">
                      <span className="sr-only">Include</span>
                    </th>
                    <th className="px-3 py-2 text-left font-medium">Employee</th>
                    <th className="px-3 py-2 text-right font-medium">Current</th>
                    <th className="px-3 py-2 text-right font-medium">New</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row) => (
                    <tr key={row.employeeId} className={cn("border-t", row.status !== "change" && "text-muted-foreground")}>
                      <td className="px-3 py-2">
                        {row.status === "change" && (
                          <Checkbox
                            checked={picked.has(row.employeeId)}
                            onCheckedChange={(checked) => {
                              const next = new Set(picked);
                              if (checked === true) next.add(row.employeeId);
                              else next.delete(row.employeeId);
                              setPicked(next);
                            }}
                            aria-label={`Include ${row.name}`}
                          />
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className="block font-medium text-foreground">{row.name}</span>
                        <span className="text-xs">{row.status === "skipped" ? row.note : row.status === "unchanged" ? "Already at or above it" : row.employeeNumber}</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.currentRate != null ? formatPeso(row.currentRate) : "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {row.status === "change" ? (
                          <span className="inline-flex items-center gap-1 font-medium text-foreground">
                            <ArrowRight className="size-3 text-muted-foreground" aria-hidden="true" />
                            {formatPeso(row.newRate!)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                  {preview.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                        No one matches this scope.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <FormError message={error} />
          </div>
        )}

        <DialogFooter>
          {preview ? (
            <>
              <Button variant="outline" onClick={() => setPreview(null)} disabled={busy !== null}>
                Back
              </Button>
              <Button onClick={apply} disabled={busy !== null || picked.size === 0} data-testid="compensation-bulk-apply">
                {busy === "apply" && <Loader2 className="size-3.5 animate-spin" />}
                {busy === "apply" ? "Applying…" : `Apply to ${picked.size}`}
              </Button>
            </>
          ) : (
            <Button onClick={runPreview} disabled={busy !== null} data-testid="compensation-bulk-preview">
              {busy === "preview" && <Loader2 className="size-3.5 animate-spin" />}
              {busy === "preview" ? "Checking…" : "Preview change"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
