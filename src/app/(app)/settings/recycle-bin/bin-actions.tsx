"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

/** Restore a deleted record, or delete it forever before its 30 days are up. */
export function BinActions({ organizationId, batchId, label }: { organizationId: string; batchId: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function send(action: "restore" | "purge") {
    setBusy(true);
    const response = await fetch(`/api/deletions/${batchId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, action }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      toast.error(body.error ?? "That didn't work.");
      throw new Error(body.error ?? "failed");
    }
    toast.success(action === "restore" ? `${label} restored` : `${label} deleted for good`);
    router.refresh();
  }

  return (
    <div className="flex justify-end gap-1">
      <Button size="sm" variant="outline" disabled={busy} onClick={() => send("restore").catch(() => undefined)}>
        {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <RotateCcw className="size-3.5" aria-hidden="true" />}
        {busy ? "Restoring…" : "Restore"}
      </Button>
      <ConfirmDialog
        trigger={
          <Button size="sm" variant="ghost" disabled={busy} className="text-destructive hover:text-destructive">
            <Trash2 className="size-3.5" aria-hidden="true" />
            Delete forever
          </Button>
        }
        title={`Delete ${label} forever?`}
        description="It can't be restored after this. The audit log keeps a record that it existed and who deleted it."
        confirmLabel="Delete forever"
        confirmLoadingLabel="Deleting…"
        onConfirm={() => send("purge")}
      />
    </div>
  );
}
