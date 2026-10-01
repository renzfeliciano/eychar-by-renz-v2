"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

export function CancelTravelOrderButton({ id, organizationId }: { id: string; organizationId: string }) {
  const router = useRouter();

  async function handleConfirm() {
    const response = await fetch(`/api/travel-orders/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error ?? "Failed to cancel travel order.");
    }
    toast.success("Travel order cancelled");
    router.refresh();
  }

  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="ghost" size="sm" aria-label="Cancel travel order">
          <X className="size-3.5" />
        </Button>
      }
      title="Cancel this travel order?"
      description="This cancels the dispatch for all listed employees. This can't be undone."
      confirmLabel="Cancel order"
      confirmLoadingLabel="Cancelling…"
      onConfirm={handleConfirm}
    />
  );
}
