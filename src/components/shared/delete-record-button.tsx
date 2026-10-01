"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormError } from "@/components/shared/form-field";

type Preview = { label: string; noun: string; summary: { label: string; count: number }[]; blockers: string[] };

/**
 * The Super Administrator's safe delete (ADR-033): shows exactly what goes
 * with the record, refuses when it's unsafe (and says why), and needs the
 * record's name typed. Deleted records go to the recycle bin for 30 days.
 * Render it only for the Super Administrator; the server checks again.
 */
export function DeleteRecordButton({
  organizationId,
  type,
  id,
  afterDeleteHref,
  size = "sm",
  iconOnly = false,
}: {
  organizationId: string;
  type: string;
  id: string;
  afterDeleteHref?: string;
  size?: "sm" | "icon-sm";
  iconOnly?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function openDialog() {
    setOpen(true);
    setPreview(null);
    setConfirm("");
    setError(null);
    const response = await fetch(`/api/deletions/preview?organizationId=${organizationId}&type=${type}&id=${id}`);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return setError(body.error ?? "Couldn't check what this would delete.");
    setPreview(body);
  }

  async function handleDelete() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    const response = await fetch("/api/deletions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, type, id, confirm }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(body.error ?? "Couldn't delete it.");
    setOpen(false);
    toast.success(`${preview.label} moved to the recycle bin`);
    if (afterDeleteHref) router.push(afterDeleteHref);
    else router.refresh();
  }

  const blocked = Boolean(preview?.blockers.length);

  return (
    <>
      <Button
        variant={iconOnly ? "ghost" : "outline"}
        size={iconOnly ? "icon-sm" : size}
        onClick={openDialog}
        aria-label={iconOnly ? "Delete" : undefined}
        className="text-destructive hover:text-destructive"
      >
        <Trash2 className="size-3.5" aria-hidden="true" />
        {!iconOnly && "Delete"}
      </Button>
      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{preview ? `Delete ${preview.label}?` : "Delete"}</DialogTitle>
            <DialogDescription>
              {blocked ? "This can't be deleted right now." : "Everything below moves to the recycle bin. You can restore it within 30 days; after that it's gone for good."}
            </DialogDescription>
          </DialogHeader>

          {!preview && !error && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Checking what goes with it…
            </p>
          )}

          {preview && blocked && (
            <ul className="flex flex-col gap-2">
              {preview.blockers.map((blocker) => (
                <li key={blocker} className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
                  <span>{blocker}</span>
                </li>
              ))}
            </ul>
          )}

          {preview && !blocked && (
            <>
              <ul className="divide-y rounded-lg border text-sm">
                {preview.summary.map((row) => (
                  <li key={row.label} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span>{row.label}</span>
                    <span className="font-medium tabular-nums">{row.count}</span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`delete-confirm-${id}`} className="text-sm">
                  Type <span className="font-semibold">{preview.label}</span> to confirm
                </label>
                <Input id={`delete-confirm-${id}`} aria-label={`Type ${preview.label} to confirm`} value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder={preview.label} autoComplete="off" />
              </div>
            </>
          )}

          <FormError message={error} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              {blocked ? "Close" : "Cancel"}
            </Button>
            {preview && !blocked && (
              <Button variant="destructive" onClick={handleDelete} disabled={busy || confirm.trim() !== preview.label}>
                {busy && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
                {busy ? "Deleting…" : "Move to recycle bin"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
