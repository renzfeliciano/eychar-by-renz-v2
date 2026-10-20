"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField, FormError } from "@/components/shared/form-field";

/**
 * The employee's typed acknowledgment, entered at the discussion. It confirms
 * the employee received the evaluation and went over it with the evaluator, not
 * that they agree with it; their own comments are kept with it either way.
 */
export function AcknowledgePanel({ organizationId, evaluationId, employeeName }: { organizationId: string; evaluationId: string; employeeName: string }) {
  const router = useRouter();
  const [typedName, setTypedName] = useState("");
  const [comments, setComments] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!typedName.trim()) {
      setError("The employee must type their full name.");
      return;
    }
    setIsSubmitting(true);
    const response = await fetch(`/api/performance-evaluations/${evaluationId}/acknowledge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, typedName, comments }),
    });
    setIsSubmitting(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to record the acknowledgment.");
      return;
    }
    toast.success("Acknowledgment recorded");
    router.refresh();
  }

  return (
    <Card className="print:hidden">
      <CardHeader>
        <CardTitle>Employee acknowledgment</CardTitle>
        <CardDescription>
          {employeeName} confirms they received this evaluation and discussed it with the evaluator. This does not necessarily mean they agree with it; they can add their own comments below.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <FormField label="Employee's comments or written explanation" htmlFor="employee-comments">
            <Textarea id="employee-comments" value={comments} onChange={(event) => setComments(event.target.value)} maxLength={4000} rows={4} />
          </FormField>
          <FormField label="Type your full name to acknowledge" htmlFor="employee-typed-name" required>
            <Input id="employee-typed-name" value={typedName} onChange={(event) => setTypedName(event.target.value)} autoComplete="off" required />
          </FormField>
          <FormError message={error} />
          <div>
            <Button type="submit" icon={PenLine} pending={isSubmitting} pendingLabel="Recording…">
              Record acknowledgment
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
