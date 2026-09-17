"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Ban } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormField, FormError } from "@/components/shared/form-field";
import { cn } from "@/lib/utils";

async function patchRequest(id: string, organizationId: string, body: Record<string, unknown>) {
  return fetch(`/api/leave-requests/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ organizationId, ...body }),
  });
}

export function DecideActions({
  requestId,
  organizationId,
  status,
  canApprove,
  canCancel,
}: {
  requestId: string;
  organizationId: string;
  status: string;
  canApprove: boolean;
  canCancel: boolean;
}) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<"approve" | "reject" | "cancel" | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (status !== "pending") return null;

  async function handleApprove() {
    setPendingAction("approve");
    const response = await patchRequest(requestId, organizationId, { action: "approve" });
    setPendingAction(null);
    if (response.ok) router.refresh();
  }

  async function handleReject() {
    setError(null);
    setPendingAction("reject");
    const response = await patchRequest(requestId, organizationId, { action: "reject", rejectionReason: rejectionReason || undefined });
    setPendingAction(null);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to reject request.");
      return;
    }
    setRejectOpen(false);
    setRejectionReason("");
    router.refresh();
  }

  async function handleCancel() {
    setPendingAction("cancel");
    const response = await patchRequest(requestId, organizationId, { action: "cancel" });
    setPendingAction(null);
    if (response.ok) router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      {canApprove && (
        <>
          <Button
            size="sm"
            variant="outline"
            onClick={handleApprove}
            disabled={pendingAction !== null}
            data-testid="leave-approve-request-button"
          >
            <Check className="size-3.5" />
            {pendingAction === "approve" ? "Approving…" : "Approve"}
          </Button>
          <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
            <DialogTrigger
              className={cn(buttonVariants({ size: "sm", variant: "outline" }), pendingAction !== null && "pointer-events-none opacity-50")}
              data-testid="leave-reject-request-button"
            >
              <X className="size-3.5" />
              Reject
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Reject leave request</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-4">
                <FormField label="Reason" htmlFor="reject-reason">
                  <Input id="reject-reason" placeholder="e.g. Insufficient balance for requested dates" value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} />
                </FormField>
                <FormError message={error} />
              </div>
              <DialogFooter>
                <Button
                  variant="destructive"
                  onClick={handleReject}
                  disabled={pendingAction !== null}
                  data-testid="leave-reject-request-submit-button"
                >
                  {pendingAction === "reject" ? "Rejecting…" : "Reject"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
      {canCancel && (
        <Button
          size="sm"
          variant="ghost"
          onClick={handleCancel}
          disabled={pendingAction !== null}
          data-testid="leave-cancel-request-button"
        >
          <Ban className="size-3.5" />
          {pendingAction === "cancel" ? "Cancelling…" : "Cancel"}
        </Button>
      )}
    </div>
  );
}
