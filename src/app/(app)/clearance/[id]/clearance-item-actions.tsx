"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Check, Flag, Loader2, MinusCircle, MoreHorizontal, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FormField, FormError } from "@/components/shared/form-field";

type Action = "clear" | "flag" | "waive" | "not_applicable" | "reopen";

const DIALOG_COPY: Record<"flag" | "waive" | "reopen", { title: string; description: string; noteLabel: string; placeholder: string; confirm: string; busy: string }> = {
  flag: {
    title: "Flag an issue",
    description: "Records what's wrong and what the employee owes for it. The amount is proposed as a deduction in the final settlement.",
    noteLabel: "What was found",
    placeholder: "e.g. Laptop screen cracked; charger not returned",
    confirm: "Flag item",
    busy: "Flagging…",
  },
  waive: {
    title: "Waive this item",
    description: "Marks it resolved without clearing it. The reason is kept in the audit trail and shown on the clearance.",
    noteLabel: "Reason for waiving",
    placeholder: "e.g. Company phone written off per IT memo 2026-14",
    confirm: "Waive item",
    busy: "Waiving…",
  },
  reopen: {
    title: "Reopen this item",
    description: "Puts it back to pending. If it blocks release, the clearance goes back into progress.",
    noteLabel: "Reason for reopening",
    placeholder: "e.g. Charger turned out to be missing",
    confirm: "Reopen item",
    busy: "Reopening…",
  },
};

/** Sign-off controls for one checklist item: Clear in one click, everything else from the ⋯ menu. */
export function ClearanceItemActions({
  organizationId,
  caseId,
  itemId,
  itemTitle,
  status,
  canSignOff,
  canWaive,
}: {
  organizationId: string;
  caseId: string;
  itemId: string;
  itemTitle: string;
  status: string;
  canSignOff: boolean;
  canWaive: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"flag" | "waive" | "reopen" | null>(null);
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);

  async function act(action: Action, extra: { note?: string; amount?: number } = {}) {
    setBusy(action);
    setError(null);
    const response = await fetch(`/api/clearance/${caseId}/items/${itemId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, action, ...extra }),
    });
    setBusy(null);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const message = body.error ?? "Failed to update the item.";
      if (dialog) setError(message);
      else toast.error(message);
      return false;
    }
    setDialog(null);
    router.refresh();
    return true;
  }

  function openDialog(kind: "flag" | "waive" | "reopen") {
    setNote("");
    setAmount("");
    setError(null);
    setDialog(kind);
  }

  async function confirmDialog() {
    if (!dialog) return;
    if (!note.trim()) {
      setError(`Enter ${DIALOG_COPY[dialog].noteLabel.toLowerCase()}.`);
      return;
    }
    const parsedAmount = amount.trim() ? Number(amount) : undefined;
    if (dialog === "flag" && parsedAmount !== undefined && (!Number.isFinite(parsedAmount) || parsedAmount < 0)) {
      setError("Enter an amount of 0 or more.");
      return;
    }
    await act(dialog, { note: note.trim(), ...(dialog === "flag" && parsedAmount !== undefined ? { amount: parsedAmount } : {}) });
  }

  if (!canSignOff && !canWaive) return null;
  const pending = status === "pending";
  const copy = dialog ? DIALOG_COPY[dialog] : null;

  return (
    <div className="flex shrink-0 items-center gap-1">
      {pending && canSignOff && (
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => act("clear")} aria-label={`Clear ${itemTitle}`}>
          {busy === "clear" ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Check className="size-3.5" aria-hidden="true" />}
          {busy === "clear" ? "Clearing…" : "Clear"}
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={`More actions for ${itemTitle}`} disabled={busy !== null} />}>
          {busy && busy !== "clear" ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <MoreHorizontal className="size-4" aria-hidden="true" />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {pending && canSignOff && (
            <DropdownMenuItem onClick={() => openDialog("flag")}>
              <Flag className="size-3.5" aria-hidden="true" />
              Flag an issue…
            </DropdownMenuItem>
          )}
          {pending && canSignOff && (
            <DropdownMenuItem onClick={() => act("not_applicable")}>
              <MinusCircle className="size-3.5" aria-hidden="true" />
              Not applicable
            </DropdownMenuItem>
          )}
          {pending && canWaive && (
            <DropdownMenuItem onClick={() => openDialog("waive")}>
              <Ban className="size-3.5" aria-hidden="true" />
              Waive…
            </DropdownMenuItem>
          )}
          {!pending && canSignOff && (
            <DropdownMenuItem onClick={() => openDialog("reopen")}>
              <RotateCcw className="size-3.5" aria-hidden="true" />
              Reopen…
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog !== null} onOpenChange={(next) => !next && setDialog(null)}>
        {copy && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{copy.title}</DialogTitle>
              <DialogDescription>
                <span className="font-medium text-foreground">{itemTitle}.</span> {copy.description}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <FormField label={copy.noteLabel} htmlFor={`item-note-${itemId}`} required>
                <Textarea id={`item-note-${itemId}`} value={note} onChange={(event) => setNote(event.target.value)} placeholder={copy.placeholder} maxLength={500} />
              </FormField>
              {dialog === "flag" && (
                <FormField label="Amount owed (₱)" htmlFor={`item-amount-${itemId}`}>
                  <Input id={`item-amount-${itemId}`} type="number" inputMode="decimal" min={0} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="e.g. 8500" />
                </FormField>
              )}
              <FormError message={error} />
            </div>
            <DialogFooter>
              <Button onClick={confirmDialog} disabled={busy !== null} variant={dialog === "flag" ? "destructive" : "default"} data-testid="clearance-item-confirm-button">
                {busy && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
                {busy ? copy.busy : copy.confirm}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
