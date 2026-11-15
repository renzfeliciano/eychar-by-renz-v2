"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { OptionSelect, type SelectOption } from "@/components/shared/option-select";
import { FormError } from "@/components/shared/form-field";

export type SeparationStatusRow = { id: string; name: string; employmentStatusCode: string | null; isDefault: boolean };

/**
 * Which employment status each separation type ends in (ADR-062). Final pay checks the employment against it;
 * "No check" leaves it unchecked. Saved per row as soon as it's picked (gaps B26).
 */
export function SeparationStatusMap({ organizationId, rows, statuses, canUpdate }: { organizationId: string; rows: SeparationStatusRow[]; statuses: SelectOption[]; canUpdate: boolean }) {
  const router = useRouter();
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(row: SeparationStatusRow, value: string) {
    setError(null);
    setSaving(row.id);
    const response = await fetch(`/api/separation-types/${row.id}/employment-status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, employmentStatusCode: value || null }),
    });
    const body = await response.json().catch(() => ({}));
    setSaving(null);
    if (!response.ok) return setError(body.error ?? "Couldn't save the employment status.");
    toast.success(`${row.name} saved`);
    router.refresh();
  }

  return (
    <div className="rounded-lg border bg-card p-4 shadow-[var(--shadow-soft)]" data-testid="separation-status-map">
      <h2 className="text-base font-semibold">Separation types and employment status</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        The employment status each kind of separation ends in. Final pay checks that the employment ended this way before the settlement is approved.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {rows.map((row) =>
          canUpdate ? (
            <div key={row.id} className="flex flex-col gap-1.5">
              <OptionSelect
                label={row.name}
                value={row.employmentStatusCode ?? ""}
                onChange={(value) => save(row, value)}
                options={statuses}
                placeholder="No check"
                testId={`separation-status-${row.id}`}
                description={row.isDefault ? "Default for this type" : undefined}
              />
              {saving === row.id && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  Saving…
                </span>
              )}
            </div>
          ) : (
            <div key={row.id} className="flex flex-col gap-0.5 text-sm">
              <span className="font-medium">{row.name}</span>
              <span className="text-muted-foreground">{statuses.find((status) => status.id === row.employmentStatusCode)?.label ?? row.employmentStatusCode ?? "No check"}</span>
            </div>
          ),
        )}
      </div>
      <FormError message={error} />
    </div>
  );
}
