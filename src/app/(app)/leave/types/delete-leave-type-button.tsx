"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

export function DeleteLeaveTypeButton({ id, name, organizationId }: { id: string; name: string; organizationId: string }) {
  const router = useRouter();

  async function handleConfirm() {
    const response = await fetch(`/api/leave-types/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error ?? "Failed to delete leave type.");
    }
    toast.success("Leave type deleted");
    router.refresh();
  }

  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Delete ${name}`}>
          <Trash2 className="size-3.5" />
        </Button>
      }
      title={`Delete "${name}"?`}
      description="This permanently removes the leave type. It's blocked if anything (a request, balance, or policy) already references it — deactivate it instead in that case."
      confirmLabel="Delete"
      confirmLoadingLabel="Deleting…"
      onConfirm={handleConfirm}
    />
  );
}
