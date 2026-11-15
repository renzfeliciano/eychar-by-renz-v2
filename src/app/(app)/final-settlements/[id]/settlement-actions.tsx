"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Banknote, CheckCheck, Loader2, RefreshCw, Send, ShieldCheck, Undo2, XCircle, BadgeCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormError, FormField } from "@/components/shared/form-field";
import { OptionSelect, type SelectOption } from "@/components/shared/option-select";

type Action = "submit" | "review" | "approve" | "return" | "disburse" | "cancel";
type Permissions = { canPrepare: boolean; canReview: boolean; canApprove: boolean; canDisburse: boolean };

const DONE: Record<Action, string> = {
  submit: "Submitted for review",
  review: "Marked as reviewed",
  approve: "Approved",
  return: "Returned to draft",
  disburse: "Recorded as paid",
  cancel: "Settlement cancelled",
};

/** The next step for a settlement, by status and permission (ADR-032). Return, cancel and disburse ask for details first. */
export function SettlementActions({
  organizationId,
  settlementId,
  clearanceCaseId,
  status,
  clearanceCleared,
  permissions,
  paymentMethods,
  warnings = [],
}: {
  organizationId: string;
  settlementId: string;
  clearanceCaseId: string;
  status: string;
  clearanceCleared: boolean;
  permissions: Permissions;
  paymentMethods: SelectOption[];
  /** Variance-check warnings the approver must confirm they checked (payroll plan Phase 5, Gate D Q4). */
  warnings?: { code: string; message: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<Action | "recompute" | null>(null);
  const [dialog, setDialog] = useState<"return" | "cancel" | "disburse" | "approve" | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");
  const [methodCode, setMethodCode] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function send(action: Action, extra: Record<string, unknown> = {}) {
    setBusy(action);
    setError(null);
    const response = await fetch(`/api/final-settlements/${settlementId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, action, ...extra }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) {
      const message = body.error ?? "That didn't work. Please try again.";
      if (dialog) setError(message);
      else toast.error(message);
      return;
    }
    setDialog(null);
    toast.success(DONE[action]);
    router.refresh();
  }

  async function recompute() {
    setBusy("recompute");
    const response = await fetch("/api/final-settlements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, clearanceCaseId }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) return toast.error(body.error ?? "Couldn't recompute the settlement.");
    toast.success("Recomputed from the latest records");
    router.refresh();
  }

  function open(kind: "return" | "cancel" | "disburse" | "approve") {
    setNote("");
    setChecked({});
    setMethodCode("");
    setReference("");
    setError(null);
    setDialog(kind);
  }

  function confirm() {
    if (dialog === "approve") {
      if (warnings.some((warning) => !checked[warning.code])) return setError("Tick each warning once you've checked it.");
      return send("approve", { acknowledgedWarnings: warnings.map((warning) => warning.code) });
    }
    if (dialog === "disburse") {
      if (!methodCode || !reference.trim()) return setError("Choose the payment method and enter its reference.");
      return send("disburse", { paymentMethodCode: methodCode, paymentReference: reference.trim() });
    }
    if (!note.trim()) return setError(dialog === "return" ? "Say what needs correcting." : "Give a reason for cancelling.");
    return send(dialog!, { note: note.trim() });
  }

  const spinner = (action: Action | "recompute") => (busy === action ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null);
  const anyBusy = busy !== null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {status === "draft" && permissions.canPrepare && (
          <>
            <Button variant="outline" size="sm" onClick={recompute} disabled={anyBusy}>
              {spinner("recompute") ?? <RefreshCw className="size-3.5" aria-hidden="true" />}
              {busy === "recompute" ? "Recomputing…" : "Recompute"}
            </Button>
            <Button size="sm" onClick={() => send("submit")} disabled={anyBusy || !clearanceCleared}>
              {spinner("submit") ?? <Send className="size-3.5" aria-hidden="true" />}
              {busy === "submit" ? "Submitting…" : "Submit for review"}
            </Button>
          </>
        )}
        {status === "submitted" && permissions.canReview && (
          <Button size="sm" onClick={() => send("review")} disabled={anyBusy}>
            {spinner("review") ?? <CheckCheck className="size-3.5" aria-hidden="true" />}
            {busy === "review" ? "Marking…" : "Mark as reviewed"}
          </Button>
        )}
        {status === "reviewed" && permissions.canApprove && (
          <Button size="sm" onClick={() => (warnings.length ? open("approve") : send("approve"))} disabled={anyBusy} data-testid="settlement-approve">
            {spinner("approve") ?? <ShieldCheck className="size-3.5" aria-hidden="true" />}
            {busy === "approve" ? "Approving…" : "Approve"}
          </Button>
        )}
        {status === "approved" && permissions.canDisburse && (
          <Button size="sm" onClick={() => open("disburse")} disabled={anyBusy}>
            <Banknote className="size-3.5" aria-hidden="true" />
            Record payment
          </Button>
        )}
        {["submitted", "reviewed", "approved"].includes(status) && permissions.canReview && (
          <Button variant="outline" size="sm" onClick={() => open("return")} disabled={anyBusy}>
            <Undo2 className="size-3.5" aria-hidden="true" />
            Return
          </Button>
        )}
        {["draft", "submitted"].includes(status) && permissions.canPrepare && (
          <Button variant="ghost" size="sm" onClick={() => open("cancel")} disabled={anyBusy}>
            <XCircle className="size-3.5" aria-hidden="true" />
            Cancel settlement
          </Button>
        )}
      </div>
      {status === "draft" && !clearanceCleared && (
        <p className="text-xs text-muted-foreground">Clearance still has blocking items. Submit once every blocking item is resolved.</p>
      )}

      <Dialog open={dialog !== null} onOpenChange={(next) => !next && !anyBusy && setDialog(null)}>
        {dialog && (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{dialog === "approve" ? "Approve with warnings" : dialog === "disburse" ? "Record payment" : dialog === "return" ? "Return for correction" : "Cancel this settlement?"}</DialogTitle>
              <DialogDescription>
                {dialog === "approve"
                  ? "Confirm you've checked each of these. Your confirmation is recorded with the approval."
                  : dialog === "disburse"
                  ? "Records how the final pay was released. This closes the employee's clearance and adds the final payroll run."
                  : dialog === "return"
                    ? "Sends it back to draft so the preparer can correct and resubmit it."
                    : "It stops here and stays on record. A new one can be prepared while the clearance is open."}
              </DialogDescription>
            </DialogHeader>
            {dialog === "approve" ? (
              <div className="flex flex-col gap-2" data-testid="settlement-approve-warnings">
                {warnings.map((warning) => (
                  <label key={warning.code} className="flex items-start gap-2 text-sm">
                    <input type="checkbox" className="mt-1" checked={!!checked[warning.code]} onChange={(event) => setChecked({ ...checked, [warning.code]: event.target.checked })} />
                    <span>{warning.message}</span>
                  </label>
                ))}
              </div>
            ) : dialog === "disburse" ? (
              <div className="flex flex-col gap-4">
                <OptionSelect label="Payment method" value={methodCode} onChange={setMethodCode} options={paymentMethods} placeholder="Select how it was paid" testId="settlement-payment-method-select" required />
                <FormField label="Payment reference" htmlFor="settlement-payment-reference" required>
                  <Input id="settlement-payment-reference" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="e.g. BDO transfer 2026-10-0042 or check no. 000123" maxLength={120} />
                </FormField>
              </div>
            ) : (
              <FormField label={dialog === "return" ? "What needs correcting" : "Reason"} htmlFor="settlement-note" required>
                <Textarea
                  id="settlement-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder={dialog === "return" ? "e.g. Add the Q3 performance bonus" : "e.g. Resignation withdrawn"}
                  maxLength={500}
                />
              </FormField>
            )}
            <FormError message={error} />
            <DialogFooter>
              <Button
                onClick={confirm}
                disabled={anyBusy}
                variant={dialog === "cancel" ? "destructive" : "default"}
                icon={dialog === "approve" ? ShieldCheck : dialog === "disburse" ? BadgeCheck : dialog === "return" ? Undo2 : X}
                pending={Boolean(busy)}
                pendingLabel={dialog === "approve" ? "Approving…" : dialog === "disburse" ? "Saving…" : dialog === "return" ? "Returning…" : "Cancelling…"}
              >
                {dialog === "approve" ? "Approve" : dialog === "disburse" ? "Mark as paid" : dialog === "return" ? "Return to draft" : "Cancel settlement"}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
