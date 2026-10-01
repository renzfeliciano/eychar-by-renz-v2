"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormError, FormField, RequiredFieldsHint } from "@/components/shared/form-field";

/** Idle sign-out rules for everyone in the organization, staff and self-service alike. */
export function SecuritySettingsForm({ organizationId, idleTimeoutSeconds, idleWarningSeconds }: { organizationId: string; idleTimeoutSeconds: number; idleWarningSeconds: number }) {
  const router = useRouter();
  const [timeoutValue, setTimeoutValue] = useState(String(idleTimeoutSeconds));
  const [warning, setWarning] = useState(String(idleWarningSeconds));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const timeoutSeconds = Number(timeoutValue);
    const warningSeconds = Number(warning);
    if (!Number.isInteger(timeoutSeconds) || !Number.isInteger(warningSeconds)) return setError("Enter whole seconds.");
    if (warningSeconds >= timeoutSeconds) return setError("The warning must start before the idle limit is reached.");
    setError(null);
    setIsSaving(true);
    const response = await fetch("/api/settings/security", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, idleTimeoutSeconds: timeoutSeconds, idleWarningSeconds: warningSeconds }),
    });
    const body = await response.json().catch(() => ({}));
    setIsSaving(false);
    if (!response.ok) return setError(body.error ?? "Couldn't save the settings.");
    toast.success("Security settings saved", { description: "Sign-ins and open sessions use them from their next activity." });
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex max-w-xl flex-col gap-4">
      <RequiredFieldsHint />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Sign out after idle (seconds)" htmlFor="security-idle" required>
          <Input id="security-idle" type="number" min={30} max={86400} value={timeoutValue} onChange={(event) => setTimeoutValue(event.target.value)} placeholder="e.g. 60" />
        </FormField>
        <FormField label="Warn before sign-out (seconds)" htmlFor="security-warning" required>
          <Input id="security-warning" type="number" min={5} value={warning} onChange={(event) => setWarning(event.target.value)} placeholder="e.g. 15" />
        </FormField>
      </div>
      <p className="text-xs text-muted-foreground">
        Applies to every account, including the self-service clock portal. Activity in any open tab counts. A session also ends when the same account signs in somewhere else.
      </p>
      <FormError message={error} />
      <Button type="submit" disabled={isSaving} className="self-start">
        {isSaving && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
        {isSaving ? "Saving…" : "Save settings"}
      </Button>
    </form>
  );
}
