"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { FormError, FormField, RequiredFieldsHint } from "@/components/shared/form-field";
import { OptionSelect, type SelectOption } from "@/components/shared/option-select";
import { cn } from "@/lib/utils";

/**
 * A manual earning or deduction (bonus, reimbursement, retirement pay, loan…). The reason is required and shown as the
 * line's basis; a supporting document from the employee's file is required too, and an earning says whether it is
 * taxable (payroll plan Phase 5, Gate D).
 */
export function ManualLineForm({ organizationId, settlementId, documents, employeeId }: { organizationId: string; settlementId: string; documents: SelectOption[]; employeeId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<"earning" | "deduction">("earning");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [taxable, setTaxable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(amount);
    if (!label.trim() || !reason.trim()) return setError("Enter a description and the reason or basis.");
    if (!Number.isFinite(value) || value <= 0) return setError("Enter an amount above zero.");
    if (!documentId) return setError("Choose the supporting document.");
    setError(null);
    setIsSubmitting(true);
    const response = await fetch(`/api/final-settlements/${settlementId}/lines`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, direction, label: label.trim(), amount: value, reason: reason.trim(), documentId, ...(direction === "earning" ? { taxable } : {}) }),
    });
    const body = await response.json().catch(() => ({}));
    setIsSubmitting(false);
    if (!response.ok) return setError(body.error ?? "Couldn't add the line.");
    setLabel("");
    setAmount("");
    setReason("");
    setDocumentId("");
    setTaxable(true);
    setOpen(false);
    toast.success("Line added");
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
            className={cn("rounded-md px-3 py-1.5 text-sm font-medium", direction === value ? "bg-card shadow-[0_1px_2px_oklch(0.235_0.028_262/10%)] ring-1 ring-border" : "text-muted-foreground hover:text-foreground")}
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
      <OptionSelect label="Supporting document" value={documentId} onChange={setDocumentId} options={documents} placeholder={documents.length ? "Choose from the employee's documents" : "No documents on file yet"} testId="manual-line-document" required />
      <p className="-mt-2 text-xs text-muted-foreground">
        Not listed? Upload it on the{" "}
        <Link href={`/people/${employeeId}?tab=documents`} className="text-primary hover:underline">
          employee&apos;s documents
        </Link>{" "}
        first.
      </p>
      {direction === "earning" && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={taxable} onChange={(event) => setTaxable(event.target.checked)} />
          Taxable compensation (counts in the tax true-up)
        </label>
      )}
      <FormError message={error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={isSubmitting} icon={X}>
          Cancel
        </Button>
        <Button type="submit" icon={Plus} pending={isSubmitting} pendingLabel="Adding…">
          Add line
        </Button>
      </div>
    </form>
  );
}
