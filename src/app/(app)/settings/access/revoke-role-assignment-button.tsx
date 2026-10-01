"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

export function RevokeRoleAssignmentButton({ id, organizationId }: { id: string; organizationId: string }) {
  const router = useRouter();

  async function handleConfirm() {
    const response = await fetch(`/api/role-assignments/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error ?? "Failed to revoke role.");
    }
    toast.success("Role revoked");
    router.refresh();
  }

  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="ghost" size="sm" aria-label="Revoke role">
          <X className="size-3.5" />
        </Button>
      }
      title="Revoke this role assignment?"
      description="The person loses every permission this role granted, effective immediately."
      confirmLabel="Revoke role"
      confirmLoadingLabel="Revoking…"
      onConfirm={handleConfirm}
    />
  );
}
