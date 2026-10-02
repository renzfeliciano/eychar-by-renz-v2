"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

/**
 * Removes a manual line from a draft settlement (recorded in the audit log).
 * Asks first — the button is a small × beside the amount, easy to hit by
 * accident on a phone — and a failure stays in the dialog.
 */
export function RemoveLineButton({ organizationId, settlementId, lineId, label }: { organizationId: string; settlementId: string; lineId: string; label: string }) {
  const router = useRouter();

  async function handleConfirm() {
    const response = await fetch(`/api/final-settlements/${settlementId}/lines/${lineId}?organizationId=${organizationId}`, { method: "DELETE" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? "Couldn't remove the line.");
    toast.success(`Removed ${label}`);
    router.refresh();
  }

  return (
    <ConfirmDialog
      trigger={
        <Button size="icon-sm" variant="ghost" className="max-md:min-h-10 max-md:min-w-10" aria-label={`Remove ${label}`}>
          <X className="size-3.5" aria-hidden="true" />
        </Button>
      }
      title={`Remove ${label}?`}
      description="The line comes off this draft settlement and the totals are recalculated. You can add it again if needed."
      confirmLabel="Remove line"
      confirmLoadingLabel="Removing…"
      cancelLabel="Keep it"
      onConfirm={handleConfirm}
      testId={`settlement-line-remove-${lineId}`}
    />
  );
}
