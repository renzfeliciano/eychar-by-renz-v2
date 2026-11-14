"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormError, FormField } from "@/components/shared/form-field";

type Initial = { name: string; tin?: string; registeredName?: string; registeredAddress?: string; zipCode?: string; rdoCode?: string };

export function EmployerTaxForm({ organizationId, initial, canUpdate }: { organizationId: string; initial: Initial; canUpdate: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState({
    tin: initial.tin ?? "",
    registeredName: initial.registeredName ?? "",
    registeredAddress: initial.registeredAddress ?? "",
    zipCode: initial.zipCode ?? "",
    rdoCode: initial.rdoCode ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });

  async function save() {
    setError(null);
    setSaving(true);
    const response = await fetch("/api/employer-tax", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, ...form }) });
    const body = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) return setError(body.error ?? "Couldn't save the employer tax details.");
    toast.success("Employer tax details saved");
    router.refresh();
  }

  return (
    <section className="flex max-w-2xl flex-col gap-4 rounded-lg border bg-card p-4 shadow-[var(--shadow-soft)]">
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="TIN" htmlFor="employer-tin" description="Including the branch code, e.g. 123-456-789-000">
          <Input id="employer-tin" value={form.tin} onChange={(event) => set({ tin: event.target.value })} disabled={!canUpdate} />
        </FormField>
        <FormField label="RDO code" htmlFor="employer-rdo">
          <Input id="employer-rdo" value={form.rdoCode} onChange={(event) => set({ rdoCode: event.target.value })} disabled={!canUpdate} />
        </FormField>
      </div>
      <FormField label="Registered name" htmlFor="employer-name" description={`Leave blank to use "${initial.name}".`}>
        <Input id="employer-name" value={form.registeredName} onChange={(event) => set({ registeredName: event.target.value })} disabled={!canUpdate} />
      </FormField>
      <div className="grid gap-3 sm:grid-cols-[3fr_1fr]">
        <FormField label="Registered address" htmlFor="employer-address">
          <Input id="employer-address" value={form.registeredAddress} onChange={(event) => set({ registeredAddress: event.target.value })} disabled={!canUpdate} />
        </FormField>
        <FormField label="ZIP code" htmlFor="employer-zip">
          <Input id="employer-zip" value={form.zipCode} onChange={(event) => set({ zipCode: event.target.value })} disabled={!canUpdate} />
        </FormField>
      </div>
      <FormError message={error} />
      {canUpdate && (
        <Button className="w-fit" onClick={save} icon={Save} pending={saving} pendingLabel="Saving…" data-testid="employer-tax-save">
          Save
        </Button>
      )}
    </section>
  );
}
