"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Clock, Pencil, Ban, RotateCcw, Loader2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormField, FormError, RequiredFieldsHint } from "@/components/shared/form-field";
import { StatusBadge } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";

export type ShiftOption = {
  id: string;
  name: string;
  code: string;
  kind: "work" | "rest";
  startTime: string | null;
  endTime: string | null;
  status: string;
};

type Draft = { name: string; code: string; kind: "work" | "rest"; startTime: string; endTime: string };
const EMPTY_DRAFT: Draft = { name: "", code: "", kind: "work", startTime: "08:00", endTime: "17:00" };

export function formatHours(shift: Pick<ShiftOption, "kind" | "startTime" | "endTime">): string {
  if (shift.kind === "rest" || !shift.startTime || !shift.endTime) return "Day off";
  return `${shift.startTime}–${shift.endTime}${shift.endTime < shift.startTime ? " (+1 day)" : ""}`;
}

export function ShiftTemplatesDialog({ organizationId, shifts }: { organizationId: string; shifts: ShiftOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  function startEdit(shift: ShiftOption) {
    setEditingId(shift.id);
    setDraft({ name: shift.name, code: shift.code, kind: shift.kind, startTime: shift.startTime ?? "08:00", endTime: shift.endTime ?? "17:00" });
    setError(null);
  }

  function resetForm() {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    // A rest day carries no times; on edit, "" tells the server to clear them.
    const times = draft.kind === "work" ? { startTime: draft.startTime, endTime: draft.endTime } : editingId ? { startTime: "", endTime: "" } : {};
    const response = await fetch(editingId ? `/api/attendance/shifts/${editingId}` : "/api/attendance/shifts", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, name: draft.name, code: draft.code, kind: draft.kind, ...times }),
    });

    setIsSubmitting(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to save the shift.");
      return;
    }
    resetForm();
    router.refresh();
  }

  async function toggleStatus(shift: ShiftOption) {
    setTogglingId(shift.id);
    setError(null);
    const response = await fetch(`/api/attendance/shifts/${shift.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, status: shift.status === "active" ? "inactive" : "active" }),
    });
    setTogglingId(null);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to update the shift.");
      return;
    }
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) resetForm();
        setOpen(next);
      }}
    >
      <DialogTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }))} data-testid="schedule-shifts-button">
        <Clock className="size-3.5" />
        Shifts
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Shifts</DialogTitle>
          <DialogDescription>The shifts HR picks from when planning each day. Editing one doesn&apos;t change days already scheduled.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4" data-testid="shift-form">
          <RequiredFieldsHint />
          <div className="grid grid-cols-[1fr_6rem] gap-3">
            <FormField label="Name" htmlFor="shift-name" required>
              <Input id="shift-name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="e.g. Day shift" required />
            </FormField>
            <FormField label="Code" htmlFor="shift-code" required>
              <Input
                id="shift-code"
                value={draft.code}
                onChange={(event) => setDraft({ ...draft, code: event.target.value.toUpperCase() })}
                placeholder="e.g. D"
                maxLength={6}
                required
              />
            </FormField>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Type</span>
            <div role="radiogroup" aria-label="Shift type" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              {(["work", "rest"] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  role="radio"
                  aria-checked={draft.kind === kind}
                  onClick={() => setDraft({ ...draft, kind })}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-[color,background-color,box-shadow] duration-150",
                    draft.kind === kind ? "bg-background text-foreground shadow-[var(--shadow-soft)]" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {kind === "work" ? "Work shift" : "Rest day"}
                </button>
              ))}
            </div>
          </div>

          {draft.kind === "work" && (
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Starts" htmlFor="shift-start" required>
                <Input id="shift-start" type="time" value={draft.startTime} onChange={(event) => setDraft({ ...draft, startTime: event.target.value })} required />
              </FormField>
              <FormField label="Ends" htmlFor="shift-end" required>
                <Input id="shift-end" type="time" value={draft.endTime} onChange={(event) => setDraft({ ...draft, endTime: event.target.value })} required />
              </FormField>
            </div>
          )}
          {draft.kind === "work" && draft.endTime < draft.startTime && (
            <p className="-mt-2 text-xs text-muted-foreground">Ends the next morning (overnight shift).</p>
          )}

          <FormError message={error} />
          <div className="flex justify-end gap-2">
            {editingId && (
              <Button type="button" variant="ghost" onClick={resetForm}>
                Cancel edit
              </Button>
            )}
            <Button type="submit" disabled={isSubmitting} data-testid="shift-submit-button">
              {isSubmitting && <Loader2 className="size-3.5 animate-spin" />}
              {isSubmitting ? "Saving…" : editingId ? "Save changes" : "Add shift"}
            </Button>
          </div>
        </form>

        {shifts.length > 0 && (
          <ul className="-mx-4 divide-y border-t" data-testid="shift-list">
            {shifts.map((shift) => (
              <li key={shift.id} className={cn("flex items-center gap-3 px-4 py-2.5", editingId === shift.id && "bg-accent/50")}>
                <span className="inline-flex min-w-9 justify-center rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold">{shift.code}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{shift.name}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">{formatHours(shift)}</p>
                </div>
                {shift.status !== "active" && <StatusBadge status={shift.status} />}
                <Button size="icon-sm" variant="ghost" onClick={() => startEdit(shift)} aria-label={`Edit ${shift.name}`}>
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  disabled={togglingId === shift.id}
                  onClick={() => toggleStatus(shift)}
                  aria-label={shift.status === "active" ? `Deactivate ${shift.name}` : `Reactivate ${shift.name}`}
                >
                  {togglingId === shift.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : shift.status === "active" ? (
                    <Ban className="size-3.5" />
                  ) : (
                    <RotateCcw className="size-3.5" />
                  )}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
