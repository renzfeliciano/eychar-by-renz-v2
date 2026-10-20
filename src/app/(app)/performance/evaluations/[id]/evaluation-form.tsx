"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField, FormError } from "@/components/shared/form-field";
import { OptionSelect, type SelectOption } from "@/components/shared/option-select";
import { RATING_SCALE, type EvaluationFactor } from "@/domains/performance/evaluation-template";

export type DraftValues = {
  evaluationFor: string;
  periodStart: string;
  periodEnd: string;
  ratings: Record<string, string>;
  goals: string;
  comments: string;
};

/** The draft form, laid out like the paper form: header, S / A / NI per criterion, goals, comments, then submit with a typed acknowledgment. */
export function EvaluationForm({
  organizationId,
  evaluationId,
  factors,
  types,
  initial,
  header,
}: {
  organizationId: string;
  evaluationId: string;
  factors: EvaluationFactor[];
  types: SelectOption[];
  initial: DraftValues;
  header: { employeeName: string; jobTitle?: string; projectName?: string; evaluatorName: string };
}) {
  const router = useRouter();
  const [values, setValues] = useState<DraftValues>(initial);
  const [typedName, setTypedName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const criteria = factors.flatMap((factor) => factor.criteria);
  const unrated = criteria.filter((criterion) => !values.ratings[criterion.key]).length;
  const set = <K extends keyof DraftValues>(key: K, value: DraftValues[K]) => setValues((current) => ({ ...current, [key]: value }));

  async function save(): Promise<boolean> {
    const response = await fetch(`/api/performance-evaluations/${evaluationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId,
        evaluationFor: values.evaluationFor,
        periodStart: values.periodStart,
        periodEnd: values.periodEnd,
        ratings: Object.entries(values.ratings).map(([criterionKey, rating]) => ({ criterionKey, rating })),
        goals: values.goals,
        evaluatorComments: values.comments,
      }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to save.");
      return false;
    }
    return true;
  }

  async function handleSave() {
    setError(null);
    setIsSaving(true);
    const ok = await save();
    setIsSaving(false);
    if (ok) toast.success("Draft saved");
  }

  async function handleSubmit() {
    setError(null);
    if (unrated > 0) {
      setError(`Rate every criterion before submitting (${unrated} not rated).`);
      return;
    }
    if (!typedName.trim()) {
      setError("Type your full name to submit.");
      return;
    }
    setIsSubmitting(true);
    if (!(await save())) {
      setIsSubmitting(false);
      return;
    }
    const response = await fetch(`/api/performance-evaluations/${evaluationId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, typedName }),
    });
    setIsSubmitting(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to submit.");
      return;
    }
    toast.success("Evaluation submitted");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6" data-testid="evaluation-form">
      <Card>
        <CardHeader>
          <CardTitle>{header.employeeName}</CardTitle>
          <CardDescription>
            {[header.jobTitle, header.projectName].filter(Boolean).join(" · ") || "No current position or project"} · Immediate head: {header.evaluatorName}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <OptionSelect label="Evaluation for" value={values.evaluationFor} onChange={(value) => set("evaluationFor", value)} options={types} placeholder="Select a type" required />
          <FormField label="Period start" htmlFor="evaluation-period-start" required>
            <Input id="evaluation-period-start" type="date" value={values.periodStart} onChange={(event) => set("periodStart", event.target.value)} required />
          </FormField>
          <FormField label="Period end" htmlFor="evaluation-period-end" required>
            <Input id="evaluation-period-end" type="date" value={values.periodEnd} onChange={(event) => set("periodEnd", event.target.value)} required />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Evaluation</CardTitle>
          <CardDescription>
            {RATING_SCALE.map((rating) => `${rating.code} = ${rating.label}`).join(" · ")}. {unrated === 0 ? "Every criterion is rated." : `${unrated} of ${criteria.length} not rated yet.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-3 text-left font-medium">Evaluation factors</th>
                {RATING_SCALE.map((rating) => (
                  <th key={rating.code} className="w-14 py-2 text-center font-medium" title={rating.label}>
                    {rating.code}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {factors.map((factor) =>
                factor.criteria.map((criterion, index) => (
                  <tr key={criterion.key} className="border-b last:border-0">
                    <td className="py-2 pr-3">
                      {index === 0 && <span className="mr-2 font-medium">{factor.name}</span>}
                      <span className="text-muted-foreground">{criterion.text}</span>
                    </td>
                    {RATING_SCALE.map((rating) => (
                      <td key={rating.code} className="text-center">
                        <input
                          type="radio"
                          name={criterion.key}
                          value={rating.code}
                          checked={values.ratings[criterion.key] === rating.code}
                          onChange={() => set("ratings", { ...values.ratings, [criterion.key]: rating.code })}
                          aria-label={`${factor.name}: ${criterion.text} — ${rating.label}`}
                          className="size-4 accent-[var(--color-primary)]"
                        />
                      </td>
                    ))}
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <FormField label="Goals for next review period" htmlFor="evaluation-goals">
            <Textarea id="evaluation-goals" value={values.goals} onChange={(event) => set("goals", event.target.value)} maxLength={4000} rows={4} />
          </FormField>
          <FormField label="Immediate superior comments in performance of employee" htmlFor="evaluation-comments">
            <Textarea id="evaluation-comments" value={values.comments} onChange={(event) => set("comments", event.target.value)} maxLength={4000} rows={4} />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Submit</CardTitle>
          <CardDescription>Submitting locks the form. Type your full name to confirm you performed this evaluation.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FormField label="Evaluator's full name" htmlFor="evaluation-typed-name" required>
            <Input id="evaluation-typed-name" value={typedName} onChange={(event) => setTypedName(event.target.value)} autoComplete="off" />
          </FormField>
          <FormError message={error} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" icon={Save} pending={isSaving} pendingLabel="Saving…" onClick={handleSave} disabled={isSubmitting}>
              Save draft
            </Button>
            <Button type="button" icon={Send} pending={isSubmitting} pendingLabel="Submitting…" onClick={handleSubmit} disabled={isSaving}>
              Submit evaluation
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
