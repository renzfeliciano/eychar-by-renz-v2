"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormError, FormField, RequiredFieldsHint } from "@/components/shared/form-field";
import { cn } from "@/lib/utils";

/** A manual earning or deduction (bonus, reimbursement, retirement pay, loan…). The reason is required and shown as the line's basis. */
export function ManualLineForm({ organizationId, settlementId }: { organizationId: string; settlementId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<"earning" | "deduction">("earning");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(amount);
    if (!label.trim() || !reason.trim()) return setError("Enter a description and the reason or basis.");
    if (!Number.isFinite(value) || value <= 0) return setError("Enter an amount above zero.");
    setError(null);
    setIsSubmitting(true);
    const response = await fetch(`/api/final-settlements/${settlementId}/lines`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, direction, label: label.trim(), amount: value, reason: reason.trim() }),
    });
    const body = await response.json().catch(() => ({}));
    setIsSubmitting(false);
    if (!response.ok) return setError(body.error ?? "Couldn't add the line.");
    setLabel("");
    setAmount("");
    setReason("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="self-start">
        <Plus className="size-3.5" aria-hidden="true" />
        Add a line (bonus, reimbursement, loan…)
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 rounded-lg border p-4">
      <RequiredFieldsHint />
      <div role="radiogroup" aria-label="Line type" className="grid w-full max-w-xs grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        {(["earning", "deduction"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={direction === value}
            onClick={() => setDirection(value)}
            className={cn("rounded-md px-3 py-1.5 text-sm font-medium", direction === value ? "bg-background shadow-[var(--shadow-soft)]" : "text-muted-foreground hover:text-foreground")}
          >
            {value === "earning" ? "Earning" : "Deduction"}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <FormField label="Description" htmlFor="manual-line-label" required>
          <Input id="manual-line-label" value={label} onChange={(event) => setLabel(event.target.value)} placeholder={direction === "earning" ? "e.g. Performance bonus" : "e.g. Company loan balance"} maxLength={120} />
        </FormField>
        <FormField label="Amount (₱)" htmlFor="manual-line-amount" required>
          <Input id="manual-line-amount" type="number" inputMode="decimal" min={0} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="e.g. 5000" />
        </FormField>
      </div>
      <FormField label="Reason or basis" htmlFor="manual-line-reason" required>
        <Input id="manual-line-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Q3 bonus approved by the GM on 30 Sep 2026" maxLength={500} />
      </FormField>
      <FormError message={error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
          {isSubmitting ? "Adding…" : "Add line"}
        </Button>
      </div>
    </form>
  );
}
