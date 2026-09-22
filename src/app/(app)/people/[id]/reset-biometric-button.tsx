"use client";

import { useRouter } from "next/navigation";
import { Fingerprint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

export function ResetBiometricButton({ organizationId, userId }: { organizationId: string; userId: string }) {
  const router = useRouter();

  async function handleConfirm() {
    const response = await fetch(`/api/employee-accounts/${userId}/webauthn`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error ?? "Failed to reset biometric verification.");
    }
    router.refresh();
  }

  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="outline" size="sm">
          <Fingerprint className="size-3.5" />
          Reset biometric
        </Button>
      }
      title="Reset biometric verification?"
      description="Removes every device this employee registered for clock-in confirmation. They'll need to set up biometric verification again on whichever device/browser they use next — useful after losing a device, switching phones, or registering on the wrong browser."
      confirmLabel="Reset"
      confirmLoadingLabel="Resetting…"
      onConfirm={handleConfirm}
    />
  );
}
