"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormError, FormField, RequiredFieldsHint } from "@/components/shared/form-field";
import type { SelectOption } from "@/components/shared/option-select";
import { PAY_FREQUENCY_LABELS, type PayFrequency } from "@/domains/payroll/engine/pay-frequency";
import { localDateKey } from "@/lib/date-key";
import { cn } from "@/lib/utils";

export type EditorBracket = { minIncome: number; maxIncome?: number | null; rate: number; baseDeduction: number };
export type EditorRow = {
  from: number;
  to?: number | null;
  employeeRate?: number | null;
  employerRate?: number | null;
  employeeAmount?: number | null;
  employerAmount?: number | null;
  extraAmount?: number | null;
};
export type EditorContribution = { code: string; name: string; floor?: number | null; ceiling?: number | null; extraLabel?: string | null; rows: EditorRow[] };
export type EditorInitial = {
  name: string;
  description: string;
  basedOnVersionId?: string;
  basedOnLabel?: string;
  taxTables: { payFrequency: PayFrequency; brackets: EditorBracket[] }[];
  contributions: EditorContribution[];
};

// The form keeps numbers as strings while editing; rates are shown as percentages.
type Cell = string;
const toCell = (value: number | null | undefined, percent = false): Cell =>
  value == null ? "" : String(percent ? Number((value * 100).toPrecision(10)) : value);
const fromCell = (value: Cell, percent = false): number | null => {
  if (value.trim() === "") return null;
  const number = Number(value);
  return percent ? number / 100 : number;
};

type BracketDraft = { minIncome: Cell; maxIncome: Cell; baseDeduction: Cell; rate: Cell };
type RowDraft = { from: Cell; to: Cell; employeeRate: Cell; employerRate: Cell; employeeAmount: Cell; employerAmount: Cell; extraAmount: Cell };
type ContributionDraft = { code: string; name: string; floor: Cell; ceiling: Cell; extraLabel: string; rows: RowDraft[] };

const FREQUENCY_OPTIONS: SelectOption[] = (Object.keys(PAY_FREQUENCY_LABELS) as PayFrequency[]).map((id) => ({ id, label: PAY_FREQUENCY_LABELS[id] }));

function NumberCell({ value, onChange, label, placeholder }: { value: Cell; onChange: (value: Cell) => void; label: string; placeholder?: string }) {
  return <Input type="number" step="any" inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} placeholder={placeholder} className="h-8 min-w-20 px-2 text-right tabular-nums md:text-xs" />;
}

/**
 * Editor for a new rule version: withholding tax tables per pay frequency
 * and contribution tables, as data. Creating it never touches the version
 * it's based on (AGENTS.md §28).
 */
export function RuleVersionEditor({ organizationId, initial }: { organizationId: string; initial: EditorInitial }) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [effectiveFrom, setEffectiveFrom] = useState(localDateKey());
  const [taxTables, setTaxTables] = useState(
    initial.taxTables.map((table) => ({
      payFrequency: table.payFrequency,
      brackets: table.brackets.map((bracket) => ({ minIncome: toCell(bracket.minIncome), maxIncome: toCell(bracket.maxIncome), baseDeduction: toCell(bracket.baseDeduction), rate: toCell(bracket.rate, true) })),
    })),
  );
  const [contributions, setContributions] = useState<ContributionDraft[]>(
    initial.contributions.map((rule) => ({
      code: rule.code,
      name: rule.name,
      floor: toCell(rule.floor),
      ceiling: toCell(rule.ceiling),
      extraLabel: rule.extraLabel ?? "",
      rows: rule.rows.map((row) => ({
        from: toCell(row.from),
        to: toCell(row.to),
        employeeRate: toCell(row.employeeRate, true),
        employerRate: toCell(row.employerRate, true),
        employeeAmount: toCell(row.employeeAmount),
        employerAmount: toCell(row.employerAmount),
        extraAmount: toCell(row.extraAmount),
      })),
    })),
  );
  const [activeTax, setActiveTax] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const updateBracket = (tableIndex: number, index: number, patch: Partial<BracketDraft>) =>
    setTaxTables(taxTables.map((table, t) => (t === tableIndex ? { ...table, brackets: table.brackets.map((bracket, b) => (b === index ? { ...bracket, ...patch } : bracket)) } : table)));
  const updateContribution = (index: number, patch: Partial<ContributionDraft>) => setContributions(contributions.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));
  const updateRow = (ruleIndex: number, index: number, patch: Partial<RowDraft>) =>
    updateContribution(ruleIndex, { rows: contributions[ruleIndex].rows.map((row, r) => (r === index ? { ...row, ...patch } : row)) });

  const usedFrequencies = new Set(taxTables.map((table) => table.payFrequency));
  const missingFrequency = FREQUENCY_OPTIONS.find((option) => !usedFrequencies.has(option.id as PayFrequency));

  async function save() {
    setError(null);
    if (!name.trim()) return setError("Name this version.");
    setSaving(true);
    const response = await fetch("/api/payroll-rule-versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId,
        name: name.trim(),
        description: description.trim() || undefined,
        effectiveFrom,
        basedOnVersionId: initial.basedOnVersionId,
        taxTables: taxTables.map((table) => ({
          payFrequency: table.payFrequency,
          brackets: table.brackets.map((bracket) => ({
            minIncome: fromCell(bracket.minIncome) ?? 0,
            maxIncome: fromCell(bracket.maxIncome),
            baseDeduction: fromCell(bracket.baseDeduction) ?? 0,
            rate: fromCell(bracket.rate, true) ?? 0,
          })),
        })),
        contributions: contributions.map((rule) => ({
          code: rule.code.trim(),
          name: rule.name.trim(),
          floor: fromCell(rule.floor),
          ceiling: fromCell(rule.ceiling),
          extraLabel: rule.extraLabel.trim() || null,
          rows: rule.rows.map((row) => ({
            from: fromCell(row.from) ?? 0,
            to: fromCell(row.to),
            employeeRate: fromCell(row.employeeRate, true),
            employerRate: fromCell(row.employerRate, true),
            employeeAmount: fromCell(row.employeeAmount),
            employerAmount: fromCell(row.employerAmount),
            extraAmount: fromCell(row.extraAmount),
          })),
        })),
      }),
    });
    const body = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) return setError(body.error ?? "Couldn't save the rule version.");
    toast.success(`Rule version v${body.ruleVersion.versionNumber} created`);
    router.push(`/payroll/rule-versions/${body.ruleVersion._id}`);
  }

  const table = taxTables[activeTax];

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-[var(--shadow-soft)]">
        <RequiredFieldsHint />
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <FormField label="Name" htmlFor="rule-version-name" required>
            <Input id="rule-version-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Philippines 2026 (PhilHealth update)" />
          </FormField>
          <FormField label="Effective from" htmlFor="rule-version-effective-from" required>
            <Input id="rule-version-effective-from" type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} />
          </FormField>
        </div>
        <FormField label="What changed" htmlFor="rule-version-description">
          <Textarea id="rule-version-description" rows={2} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="e.g. PhilHealth premium per Circular 2025-0012" />
        </FormField>
        {initial.basedOnLabel && <p className="text-xs text-muted-foreground">Starting from {initial.basedOnLabel}. That version stays exactly as it is.</p>}
      </section>

      <section className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-[var(--shadow-soft)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Withholding tax</h2>
            <p className="text-sm text-muted-foreground">Tax = base tax + rate × (taxable pay − bracket start). One table per pay frequency.</p>
          </div>
          {missingFrequency && (
            <Button size="sm" variant="outline" onClick={() => setTaxTables([...taxTables, { payFrequency: missingFrequency.id as PayFrequency, brackets: [{ minIncome: "0", maxIncome: "", baseDeduction: "0", rate: "0" }] }])}>
              <Plus className="size-3.5" />
              Add {missingFrequency.label.toLowerCase()} table
            </Button>
          )}
        </div>
        <div role="tablist" aria-label="Pay frequency" className="flex gap-1 border-b">
          {taxTables.map((entry, index) => (
            <button
              key={entry.payFrequency}
              role="tab"
              type="button"
              aria-selected={index === activeTax}
              onClick={() => setActiveTax(index)}
              className={cn("-mb-px border-b-2 px-3 py-1.5 text-sm transition-colors", index === activeTax ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
            >
              {PAY_FREQUENCY_LABELS[entry.payFrequency]}
            </button>
          ))}
        </div>
        {table && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="px-1 py-1.5 text-left font-medium">Taxable pay from (₱)</th>
                  <th className="px-1 py-1.5 text-left font-medium">Up to (₱)</th>
                  <th className="px-1 py-1.5 text-left font-medium">Base tax (₱)</th>
                  <th className="px-1 py-1.5 text-left font-medium">Rate on excess (%)</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {table.brackets.map((bracket, index) => (
                  <tr key={index}>
                    <td className="p-1"><NumberCell label="From" value={bracket.minIncome} onChange={(minIncome) => updateBracket(activeTax, index, { minIncome })} /></td>
                    <td className="p-1"><NumberCell label="Up to" value={bracket.maxIncome} placeholder="and over" onChange={(maxIncome) => updateBracket(activeTax, index, { maxIncome })} /></td>
                    <td className="p-1"><NumberCell label="Base tax" value={bracket.baseDeduction} onChange={(baseDeduction) => updateBracket(activeTax, index, { baseDeduction })} /></td>
                    <td className="p-1"><NumberCell label="Rate" value={bracket.rate} onChange={(rate) => updateBracket(activeTax, index, { rate })} /></td>
                    <td className="p-1">
                      <Button size="icon-sm" variant="ghost" aria-label="Remove bracket" onClick={() => setTaxTables(taxTables.map((entry, t) => (t === activeTax ? { ...entry, brackets: entry.brackets.filter((_, b) => b !== index) } : entry)))}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-2 flex items-center justify-between">
              <Button size="sm" variant="ghost" onClick={() => setTaxTables(taxTables.map((entry, t) => (t === activeTax ? { ...entry, brackets: [...entry.brackets, { minIncome: "", maxIncome: "", baseDeduction: "0", rate: "" }] } : entry)))}>
                <Plus className="size-3.5" />
                Add bracket
              </Button>
              {taxTables.length > 1 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    setTaxTables(taxTables.filter((_, t) => t !== activeTax));
                    setActiveTax(0);
                  }}
                >
                  Remove this table
                </Button>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-[var(--shadow-soft)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Government contributions</h2>
            <p className="text-sm text-muted-foreground">
              Monthly amounts on monthly basic pay. Each row covers a salary range and gives fixed amounts or rates (applied to the pay clamped between the floor and ceiling).
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setContributions([...contributions, { code: "", name: "", floor: "", ceiling: "", extraLabel: "", rows: [{ from: "0", to: "", employeeRate: "", employerRate: "", employeeAmount: "", employerAmount: "", extraAmount: "" }] }])}>
            <Plus className="size-3.5" />
            Add contribution
          </Button>
        </div>
        {contributions.map((rule, ruleIndex) => (
          <details key={ruleIndex} className="group rounded-lg border" open={rule.rows.length < 5}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5">
              <span className="font-medium">
                {rule.name || "New contribution"} <span className="text-xs font-normal text-muted-foreground">{rule.rows.length} rows</span>
              </span>
              <span className="text-xs text-muted-foreground group-open:hidden">Show table</span>
            </summary>
            <div className="flex flex-col gap-3 border-t p-3">
              <div className="grid gap-2 sm:grid-cols-5">
                <FormField label="Code">
                  <Input value={rule.code} onChange={(event) => updateContribution(ruleIndex, { code: event.target.value })} placeholder="e.g. SSS" className="h-8" />
                </FormField>
                <FormField label="Name">
                  <Input value={rule.name} onChange={(event) => updateContribution(ruleIndex, { name: event.target.value })} placeholder="e.g. SSS" className="h-8" />
                </FormField>
                <FormField label="Floor (₱)">
                  <NumberCell label="Floor" value={rule.floor} onChange={(floor) => updateContribution(ruleIndex, { floor })} placeholder="none" />
                </FormField>
                <FormField label="Ceiling (₱)">
                  <NumberCell label="Ceiling" value={rule.ceiling} onChange={(ceiling) => updateContribution(ruleIndex, { ceiling })} placeholder="none" />
                </FormField>
                <FormField label="Employer add-on label">
                  <Input value={rule.extraLabel} onChange={(event) => updateContribution(ruleIndex, { extraLabel: event.target.value })} placeholder="e.g. EC" className="h-8" />
                </FormField>
              </div>
              <div className="max-h-96 overflow-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
                    <tr>
                      {["From (₱)", "To (₱)", "Employee %", "Employer %", "Employee ₱", "Employer ₱", "Add-on ₱", ""].map((header) => (
                        <th key={header} className="px-1 py-1.5 text-left font-medium whitespace-nowrap">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rule.rows.map((row, index) => (
                      <tr key={index} className="border-t">
                        <td className="p-1"><NumberCell label="From" value={row.from} onChange={(from) => updateRow(ruleIndex, index, { from })} /></td>
                        <td className="p-1"><NumberCell label="To" value={row.to} placeholder="and over" onChange={(to) => updateRow(ruleIndex, index, { to })} /></td>
                        <td className="p-1"><NumberCell label="Employee rate" value={row.employeeRate} onChange={(employeeRate) => updateRow(ruleIndex, index, { employeeRate })} /></td>
                        <td className="p-1"><NumberCell label="Employer rate" value={row.employerRate} onChange={(employerRate) => updateRow(ruleIndex, index, { employerRate })} /></td>
                        <td className="p-1"><NumberCell label="Employee amount" value={row.employeeAmount} onChange={(employeeAmount) => updateRow(ruleIndex, index, { employeeAmount })} /></td>
                        <td className="p-1"><NumberCell label="Employer amount" value={row.employerAmount} onChange={(employerAmount) => updateRow(ruleIndex, index, { employerAmount })} /></td>
                        <td className="p-1"><NumberCell label="Add-on amount" value={row.extraAmount} onChange={(extraAmount) => updateRow(ruleIndex, index, { extraAmount })} /></td>
                        <td className="p-1">
                          <Button size="icon-sm" variant="ghost" aria-label="Remove row" onClick={() => updateContribution(ruleIndex, { rows: rule.rows.filter((_, r) => r !== index) })}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between">
                <Button size="sm" variant="ghost" onClick={() => updateContribution(ruleIndex, { rows: [...rule.rows, { from: "", to: "", employeeRate: "", employerRate: "", employeeAmount: "", employerAmount: "", extraAmount: "" }] })}>
                  <Plus className="size-3.5" />
                  Add row
                </Button>
                <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => setContributions(contributions.filter((_, i) => i !== ruleIndex))}>
                  Remove contribution
                </Button>
              </div>
            </div>
          </details>
        ))}
      </section>

      <div className="flex flex-col items-end gap-3">
        <FormError message={error} />
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.back()} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving} data-testid="rule-version-save">
            {saving && <Loader2 className="size-3.5 animate-spin" />}
            {saving ? "Saving…" : "Create version"}
          </Button>
        </div>
      </div>
    </div>
  );
}
