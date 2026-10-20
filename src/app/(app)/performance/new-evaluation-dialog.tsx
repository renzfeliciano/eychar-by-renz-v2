"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { FormField, FormError, RequiredFieldsHint } from "@/components/shared/form-field";
import { OptionSelect, type SelectOption } from "@/components/shared/option-select";
import { cn } from "@/lib/utils";

type Candidate = { employeeId: string; name: string; positionTitle?: string };
export type EvaluationTypeOption = SelectOption & { defaultPeriodMonths?: number };

/** Last day of a period that starts on `start` and runs `months` months (calendar days, UTC). */
function periodEndFor(start: string, months: number): string {
  const date = new Date(`${start}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCMonth(date.getUTCMonth() + months);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function NewEvaluationDialog({
  organizationId,
  employees,
  types,
  selfEmployeeId,
  canManage,
}: {
  organizationId: string;
  employees: SelectOption[];
  types: EvaluationTypeOption[];
  /** The signed-in user's own employee record, if they have one: an evaluator can only start evaluations as themselves. */
  selfEmployeeId: string | null;
  /** HR / Operations oversight: may start one for anyone and name the evaluator by hand. */
  canManage: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [evaluatorId, setEvaluatorId] = useState("");
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [override, setOverride] = useState(false);
  const [evaluationFor, setEvaluationFor] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoadingEvaluators, setIsLoadingEvaluators] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function reset() {
    setEmployeeId("");
    setEvaluatorId("");
    setCandidates(null);
    setOverride(false);
    setEvaluationFor("");
    setPeriodStart("");
    setPeriodEnd("");
    setError(null);
  }

  async function chooseEmployee(id: string) {
    setEmployeeId(id);
    setEvaluatorId("");
    setCandidates(null);
    setOverride(false);
    setError(null);
    if (!id) return;
    setIsLoadingEvaluators(true);
    const response = await fetch(`/api/performance-evaluations/evaluators?organizationId=${organizationId}&employeeId=${id}`);
    setIsLoadingEvaluators(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Could not look up the evaluator.");
      return;
    }
    const body = (await response.json()) as { candidates: Candidate[] };
    // An evaluator can only act as themselves; oversight sees everyone the rules allow.
    const usable = canManage ? body.candidates : body.candidates.filter((candidate) => candidate.employeeId === selfEmployeeId);
    setCandidates(usable);
    if (usable.length === 1) setEvaluatorId(usable[0].employeeId);
  }

  function applyPeriod(nextType: string, nextStart: string) {
    const months = types.find((type) => type.id === nextType)?.defaultPeriodMonths;
    if (months && nextStart) setPeriodEnd(periodEndFor(nextStart, months));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!employeeId || !evaluatorId || !evaluationFor || !periodStart || !periodEnd) {
      setError("Fill in every field.");
      return;
    }
    setIsSubmitting(true);
    const response = await fetch("/api/performance-evaluations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, employeeId, evaluatorId, evaluationFor, periodStart, periodEnd }),
    });
    setIsSubmitting(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to start the evaluation.");
      return;
    }
    const { evaluation } = (await response.json()) as { evaluation: { _id: string } };
    setOpen(false);
    toast.success("Evaluation started");
    router.push(`/performance/evaluations/${evaluation._id}`);
  }

  const evaluatorOptions: SelectOption[] =
    override || (canManage && candidates?.length === 0)
      ? employees.filter((employee) => employee.id !== employeeId)
      : (candidates ?? []).map((candidate) => ({ id: candidate.employeeId, label: candidate.positionTitle ? `${candidate.name} · ${candidate.positionTitle}` : candidate.name }));
  const noEvaluator = candidates !== null && candidates.length === 0 && !canManage;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) reset();
        setOpen(next);
      }}
    >
      <DialogTrigger className={cn(buttonVariants({ size: "sm" }))} data-testid="performance-evaluations-create-button">
        <Plus className="size-3.5" />
        New evaluation
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New evaluation</DialogTitle>
          <DialogDescription>Starts the Employee Performance Evaluation Form as a draft.</DialogDescription>
        </DialogHeader>
        <form id="new-evaluation-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <RequiredFieldsHint />
          <OptionSelect label="Employee" value={employeeId} onChange={chooseEmployee} options={employees} placeholder="Select an employee" required />
          {employeeId && (
            <>
              <OptionSelect
                label="Evaluator"
                value={evaluatorId}
                onChange={setEvaluatorId}
                options={evaluatorOptions}
                placeholder={isLoadingEvaluators ? "Finding the evaluator…" : "Select the evaluator"}
                description={canManage && candidates?.length === 0 ? "No one matches the evaluator rules for this employee; choose one by hand." : undefined}
                required
              />
              {noEvaluator && <p className="text-sm text-destructive">You are not an authorized evaluator for this employee. Ask HR.</p>}
              {canManage && candidates && candidates.length > 0 && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={override} onChange={(event) => setOverride(event.target.checked)} className="size-4 accent-[var(--color-primary)]" />
                  Choose a different evaluator (recorded as an override)
                </label>
              )}
            </>
          )}
          <OptionSelect
            label="Evaluation for"
            value={evaluationFor}
            onChange={(value) => {
              setEvaluationFor(value);
              applyPeriod(value, periodStart);
            }}
            options={types}
            placeholder="Select a type"
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Period start" htmlFor="evaluation-start" required>
              <Input
                id="evaluation-start"
                type="date"
                value={periodStart}
                onChange={(event) => {
                  setPeriodStart(event.target.value);
                  applyPeriod(evaluationFor, event.target.value);
                }}
                required
              />
            </FormField>
            <FormField label="Period end" htmlFor="evaluation-end" required>
              <Input id="evaluation-end" type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} required />
            </FormField>
          </div>
          <FormError message={error} />
        </form>
        <DialogFooter>
          <Button type="submit" form="new-evaluation-form" icon={Plus} pending={isSubmitting} pendingLabel="Starting…" disabled={noEvaluator}>
            Start evaluation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
