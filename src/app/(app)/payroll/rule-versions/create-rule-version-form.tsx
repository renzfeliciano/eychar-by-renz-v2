"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField, FormError } from "@/components/shared/form-field";

type BracketRow = { minIncome: string; maxIncome: string; rate: string; baseDeduction: string };
type ContributionRow = { name: string; employeeRate: string; cap: string };

const EMPTY_BRACKET: BracketRow = { minIncome: "", maxIncome: "", rate: "", baseDeduction: "0" };
const EMPTY_CONTRIBUTION: ContributionRow = { name: "", employeeRate: "", cap: "" };

export function CreateRuleVersionForm({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [brackets, setBrackets] = useState<BracketRow[]>([{ ...EMPTY_BRACKET }]);
  const [contributions, setContributions] = useState<ContributionRow[]>([{ ...EMPTY_CONTRIBUTION }]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch("/api/payroll-rule-versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId,
        description: description || undefined,
        taxBrackets: brackets
          .filter((bracket) => bracket.minIncome !== "" && bracket.rate !== "")
          .map((bracket) => ({
            minIncome: Number(bracket.minIncome),
            maxIncome: bracket.maxIncome === "" ? undefined : Number(bracket.maxIncome),
            rate: Number(bracket.rate),
            baseDeduction: Number(bracket.baseDeduction || 0),
          })),
        statutoryContributions: contributions
          .filter((contribution) => contribution.name !== "" && contribution.employeeRate !== "")
          .map((contribution) => ({
            name: contribution.name,
            employeeRate: Number(contribution.employeeRate),
            cap: contribution.cap === "" ? undefined : Number(contribution.cap),
          })),
      }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to create payroll rule version.");
      return;
    }

    setDescription("");
    setBrackets([{ ...EMPTY_BRACKET }]);
    setContributions([{ ...EMPTY_CONTRIBUTION }]);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New rule version</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <FormField label="Description (optional)" htmlFor="rule-version-description">
            <Input
              id="rule-version-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="e.g. Illustrative example — not authoritative rates"
            />
          </FormField>

          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium">Tax brackets</p>
            {brackets.map((bracket, index) => (
              <div key={index} className="grid grid-cols-2 gap-3 sm:grid-cols-5 sm:items-end">
                <FormField label="Min income">
                  <Input
                    type="number"
                    value={bracket.minIncome}
                    onChange={(event) =>
                      setBrackets(brackets.map((row, i) => (i === index ? { ...row, minIncome: event.target.value } : row)))
                    }
                  />
                </FormField>
                <FormField label="Max income (optional)">
                  <Input
                    type="number"
                    value={bracket.maxIncome}
                    onChange={(event) =>
                      setBrackets(brackets.map((row, i) => (i === index ? { ...row, maxIncome: event.target.value } : row)))
                    }
                  />
                </FormField>
                <FormField label="Rate (0-1)">
                  <Input
                    type="number"
                    step="0.01"
                    value={bracket.rate}
                    onChange={(event) => setBrackets(brackets.map((row, i) => (i === index ? { ...row, rate: event.target.value } : row)))}
                  />
                </FormField>
                <FormField label="Base deduction">
                  <Input
                    type="number"
                    value={bracket.baseDeduction}
                    onChange={(event) =>
                      setBrackets(brackets.map((row, i) => (i === index ? { ...row, baseDeduction: event.target.value } : row)))
                    }
                  />
                </FormField>
                <Button type="button" variant="ghost" size="sm" onClick={() => setBrackets(brackets.filter((_, i) => i !== index))}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setBrackets([...brackets, { ...EMPTY_BRACKET }])}>
              <Plus className="size-3.5" />
              Add bracket
            </Button>
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium">Statutory contributions</p>
            {contributions.map((contribution, index) => (
              <div key={index} className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:items-end">
                <FormField label="Name">
                  <Input
                    value={contribution.name}
                    onChange={(event) =>
                      setContributions(contributions.map((row, i) => (i === index ? { ...row, name: event.target.value } : row)))
                    }
                  />
                </FormField>
                <FormField label="Employee rate (0-1)">
                  <Input
                    type="number"
                    step="0.001"
                    value={contribution.employeeRate}
                    onChange={(event) =>
                      setContributions(contributions.map((row, i) => (i === index ? { ...row, employeeRate: event.target.value } : row)))
                    }
                  />
                </FormField>
                <FormField label="Cap (optional)">
                  <Input
                    type="number"
                    value={contribution.cap}
                    onChange={(event) =>
                      setContributions(contributions.map((row, i) => (i === index ? { ...row, cap: event.target.value } : row)))
                    }
                  />
                </FormField>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setContributions(contributions.filter((_, i) => i !== index))}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => setContributions([...contributions, { ...EMPTY_CONTRIBUTION }])}
            >
              <Plus className="size-3.5" />
              Add contribution
            </Button>
          </div>

          <FormError message={error} />
          <Button type="submit" disabled={isSubmitting} className="w-fit">
            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {isSubmitting ? "Creating…" : "Create rule version"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
