"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormField, FormError } from "@/components/shared/form-field";

/** Cancels a clearance (e.g. the resignation was withdrawn). A reason is required and audited. */
export function CancelClearanceButton({ organizationId, caseId }: { organizationId: string; caseId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleCancel() {
    if (!reason.trim()) {
      setError("Give a reason for cancelling.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    const response = await fetch(`/api/clearance/${caseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, reason: reason.trim() }),
    });
    setIsSubmitting(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to cancel the clearance.");
      return;
    }
    setOpen(false);
    toast.success("Clearance cancelled");
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setReason("");
          setError(null);
        }
        setOpen(next);
      }}
    >
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <XCircle className="size-3.5" aria-hidden="true" />
        Cancel clearance
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel this clearance?</DialogTitle>
          <DialogDescription>Its checklist freezes as it is. You can open a new clearance for this employee later.</DialogDescription>
        </DialogHeader>
        <FormField label="Reason" htmlFor="cancel-clearance-reason" required>
          <Textarea id="cancel-clearance-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Resignation withdrawn by email on 2 Oct 2026" maxLength={500} />
        </FormField>
        <FormError message={error} />
        <DialogFooter>
          <Button variant="destructive" onClick={handleCancel} icon={XCircle} pending={isSubmitting} pendingLabel="Cancelling…">
            Cancel clearance
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
