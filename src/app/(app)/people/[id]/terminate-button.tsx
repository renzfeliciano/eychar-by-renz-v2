"use client";

import { useRouter } from "next/navigation";
import { UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

export function TerminateButton({ employeeId, organizationId }: { employeeId: string; organizationId: string }) {
  const router = useRouter();

  async function handleConfirm() {
    const response = await fetch(`/api/employees/${employeeId}/employment`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error ?? "Failed to terminate employment.");
    }
    router.refresh();
  }

  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="destructive">
          <UserX className="size-4" />
          Terminate employment
        </Button>
      }
      title="Terminate this employment?"
      description="This ends the employee's current employment record effective today. This can't be undone from here."
      confirmLabel="Terminate employment"
      confirmLoadingLabel="Terminating…"
      onConfirm={handleConfirm}
    />
  );
}
