"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormError, FormField, RequiredFieldsHint } from "@/components/shared/form-field";

/** Idle sign-out rules for everyone in the organization, staff and self-service alike. */
export function SecuritySettingsForm({ organizationId, idleTimeoutSeconds, idleWarningSeconds }: { organizationId: string; idleTimeoutSeconds: number; idleWarningSeconds: number }) {
  const router = useRouter();
  const [timeoutValue, setTimeoutValue] = useState(String(idleTimeoutSeconds));
  // Asked the way people think about it: when the warning shows (seconds of
  // idle), and when they're signed out. Stored as the warning's length.
  const [warnAfter, setWarnAfter] = useState(String(idleTimeoutSeconds - idleWarningSeconds));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const timeoutSeconds = Number(timeoutValue);
    const warnAfterSeconds = Number(warnAfter);
    if (!Number.isInteger(timeoutSeconds) || !Number.isInteger(warnAfterSeconds)) return setError("Enter whole seconds.");
    if (warnAfterSeconds < 1 || warnAfterSeconds > timeoutSeconds - 5) return setError("Show the warning at least 5 seconds before the sign-out, so there's time to choose to stay.");
    const warningSeconds = timeoutSeconds - warnAfterSeconds;
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
        <FormField label="Show the warning after (seconds idle)" htmlFor="security-warning" required>
          <Input id="security-warning" type="number" min={1} value={warnAfter} onChange={(event) => setWarnAfter(event.target.value)} placeholder="e.g. 45" />
        </FormField>
        <FormField label="Sign out after (seconds idle)" htmlFor="security-idle" required>
          <Input id="security-idle" type="number" min={30} max={86400} value={timeoutValue} onChange={(event) => setTimeoutValue(event.target.value)} placeholder="e.g. 60" />
        </FormField>
      </div>
      <p className="text-xs text-muted-foreground">
        Default: warning at 45 seconds, sign-out at 60. Applies to every account, including the self-service clock portal. Activity in any open tab counts. A session also ends when the same account signs in somewhere else.
      </p>
      <FormError message={error} />
      <Button type="submit" className="self-start" icon={Save} pending={isSaving} pendingLabel="Saving…">
        Save settings
      </Button>
    </form>
  );
}
