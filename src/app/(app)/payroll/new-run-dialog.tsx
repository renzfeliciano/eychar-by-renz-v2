"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Plus, PlayCircle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormError, FormField, RequiredFieldsHint } from "@/components/shared/form-field";
import { OptionSelect, type SelectOption } from "@/components/shared/option-select";
import { formatDateKey, formatDateRange } from "@/lib/date-key";
import { cn } from "@/lib/utils";

export type RunSuggestion = { key: string; scheduleName: string; projectId: string; start: string; end: string; payDate: string };

type Draft = { projectId: string; payPeriodStart: string; payPeriodEnd: string; payDate: string };
const EMPTY: Draft = { projectId: "", payPeriodStart: "", payPeriodEnd: "", payDate: "" };

/**
 * Prepares a draft run. Scope is the whole organization or one project;
 * payroll schedules offer their current cutoffs as one-click fills.
 */
export function NewRunDialog({ organizationId, projects, suggestions }: { organizationId: string; projects: SelectOption[]; suggestions: RunSuggestion[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    if (!draft.payPeriodStart || !draft.payPeriodEnd || !draft.payDate) {
      setError("Enter the period and the pay date.");
      return;
    }
    setIsSubmitting(true);
    const response = await fetch("/api/payroll-runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, ...draft, projectId: draft.projectId || undefined }),
    });
    const body = await response.json().catch(() => ({}));
    setIsSubmitting(false);
    if (!response.ok) {
      setError(body.error ?? "Couldn't prepare the payroll run.");
      return;
    }
    toast.success(`${body.run.runNumber} prepared as a draft`);
    setOpen(false);
    router.push(`/payroll/${body.run._id}`);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setDraft(EMPTY);
          setError(null);
        }
        setOpen(next);
      }}
    >
      <DialogTrigger className={cn(buttonVariants({ size: "sm" }))} data-testid="payroll-new-run-button">
        <Plus className="size-3.5" />
        New payroll run
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New payroll run</DialogTitle>
          <DialogDescription>
            Prepares a draft from attendance and pay terms. You can review it, add overtime or deductions, and recompute before submitting it for approval.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {suggestions.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">From payroll schedules</span>
              <div className="flex flex-col gap-1.5">
                {suggestions.map((suggestion) => {
                  const selected =
                    draft.projectId === suggestion.projectId && draft.payPeriodStart === suggestion.start && draft.payPeriodEnd === suggestion.end && draft.payDate === suggestion.payDate;
                  return (
                    <button
                      key={suggestion.key}
                      type="button"
                      onClick={() => setDraft({ projectId: suggestion.projectId, payPeriodStart: suggestion.start, payPeriodEnd: suggestion.end, payDate: suggestion.payDate })}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-[border-color,background-color] duration-150 hover:border-primary/50",
                        selected && "border-primary bg-primary/5",
                      )}
                    >
                      <CalendarClock className="size-4 shrink-0 text-primary" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{suggestion.scheduleName}</span>
                        <span className="block text-xs text-muted-foreground">
                          {formatDateRange(suggestion.start, suggestion.end)} · pay {formatDateKey(suggestion.payDate, { month: "short", day: "numeric" })}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <RequiredFieldsHint />
          <OptionSelect label="Who's paid" value={draft.projectId} onChange={(projectId) => setDraft({ ...draft, projectId })} options={projects} placeholder="Everyone (all projects)" testId="payroll-run-scope" />
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Period from" htmlFor="run-period-start" required>
              <Input id="run-period-start" type="date" value={draft.payPeriodStart} onChange={(event) => setDraft({ ...draft, payPeriodStart: event.target.value })} />
            </FormField>
            <FormField label="Period to" htmlFor="run-period-end" required>
              <Input id="run-period-end" type="date" value={draft.payPeriodEnd} onChange={(event) => setDraft({ ...draft, payPeriodEnd: event.target.value })} />
            </FormField>
          </div>
          <FormField label="Pay date" htmlFor="run-pay-date" required>
            <Input id="run-pay-date" type="date" value={draft.payDate} onChange={(event) => setDraft({ ...draft, payDate: event.target.value })} className="sm:w-1/2" />
          </FormField>
          <FormError message={error} />
        </div>

        <DialogFooter>
          <Button onClick={handleSubmit} data-testid="payroll-new-run-submit" icon={PlayCircle} pending={isSubmitting} pendingLabel="Preparing…">
            Prepare draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
