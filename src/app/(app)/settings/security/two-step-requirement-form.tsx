"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormError } from "@/components/shared/form-field";

type Props = {
  organizationId: string;
  required: boolean;
  /** Sent back unchanged: the settings endpoint takes the whole security block. */
  idleTimeoutSeconds: number;
  idleWarningSeconds: number;
};

/** Whether HR and admin (staff) accounts must use two-step verification. Self-service employee accounts are exempt. */
export function TwoStepRequirementForm({ organizationId, required, idleTimeoutSeconds, idleWarningSeconds }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(required);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function save() {
    setError(null);
    setIsSaving(true);
    const response = await fetch("/api/settings/security", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, idleTimeoutSeconds, idleWarningSeconds, requireTwoStepForStaff: value }),
    });
    const body = await response.json().catch(() => ({}));
    setIsSaving(false);
    if (!response.ok) return setError(body.error ?? "Couldn't save the setting.");
    toast.success(value ? "Two-step verification is now required" : "Two-step verification is now optional", {
      description: value ? "Staff without it are asked to set it up at their next activity." : undefined,
    });
    router.refresh();
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <label htmlFor="require-two-step" className="flex cursor-pointer items-start gap-3">
        <Checkbox id="require-two-step" checked={value} onCheckedChange={(checked) => setValue(checked === true)} className="mt-0.5" />
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">Require two-step verification for HR and admin accounts</span>
          <span className="text-xs text-muted-foreground">
            Accounts without it are sent to a set-up page and can&apos;t open the workspace until it&apos;s on. Self-service employee accounts (clock portal) aren&apos;t affected.
          </span>
        </span>
      </label>
      <FormError message={error} />
      <Button type="button" onClick={save} disabled={isSaving || value === required} className="self-start" icon={Save} pending={isSaving} pendingLabel="Saving…">
        Save
      </Button>
    </div>
  );
}
