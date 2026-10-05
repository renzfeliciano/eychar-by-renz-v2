"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Check, Clock, Pencil, Ban, RotateCcw, Save, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormField, FormError, RequiredFieldsHint } from "@/components/shared/form-field";
import { StatusBadge } from "@/components/shared/status-badge";
import { SHIFT_COLORS, nextShiftColor, shiftColor } from "@/domains/attendance/shift-colors";
import { describeShiftHours } from "@/domains/attendance/shift-display";
import { cn } from "@/lib/utils";

export type ShiftOption = {
  id: string;
  name: string;
  code: string;
  kind: "work" | "rest";
  pattern: "fixed" | "flexible";
  color: string;
  startTime: string | null;
  endTime: string | null;
  latestStartTime: string | null;
  requiredHours: number | null;
  status: string;
};

type Draft = {
  name: string;
  code: string;
  kind: "work" | "rest";
  pattern: "fixed" | "flexible";
  color: string;
  startTime: string;
  endTime: string;
  latestStartTime: string;
  requiredHours: string;
};

const DEFAULT_TIMES = { startTime: "08:00", endTime: "17:00", latestStartTime: "10:00", requiredHours: "8" };

export function formatHours(shift: Pick<ShiftOption, "kind" | "pattern" | "startTime" | "endTime" | "latestStartTime" | "requiredHours">): string {
  return describeShiftHours(shift);
}

function SegmentedControl<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-lg bg-muted p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-[color,background-color,box-shadow] duration-150",
            value === option.value ? "bg-card text-foreground shadow-[0_1px_2px_oklch(0.235_0.028_262/10%)] ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function ShiftTemplatesDialog({ organizationId, shifts }: { organizationId: string; shifts: ShiftOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(null));
  // Once HR picks a color, switching work/rest no longer re-suggests one.
  const [colorChosen, setColorChosen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  function emptyDraft(excludeId: string | null, kind: "work" | "rest" = "work"): Draft {
    const used = shifts.filter((shift) => shift.id !== excludeId).map((shift) => shift.color);
    return { name: "", code: "", kind, pattern: "fixed", color: nextShiftColor(used, kind), ...DEFAULT_TIMES };
  }

  function startEdit(shift: ShiftOption) {
    setEditingId(shift.id);
    setColorChosen(true);
    setDraft({
      name: shift.name,
      code: shift.code,
      kind: shift.kind,
      pattern: shift.pattern,
      color: shift.color,
      startTime: shift.startTime ?? DEFAULT_TIMES.startTime,
      endTime: shift.endTime ?? DEFAULT_TIMES.endTime,
      latestStartTime: shift.latestStartTime ?? DEFAULT_TIMES.latestStartTime,
      requiredHours: shift.requiredHours?.toString() ?? DEFAULT_TIMES.requiredHours,
    });
    setError(null);
  }

  function resetForm() {
    setEditingId(null);
    setColorChosen(false);
    setDraft(emptyDraft(null));
    setError(null);
  }

  function setKind(kind: "work" | "rest") {
    setDraft((current) => ({ ...current, kind, color: colorChosen ? current.color : emptyDraft(editingId, kind).color }));
  }

  // Only the fields for the chosen shape are sent; on edit, "" clears the others server-side.
  function timesPayload() {
    const clear = editingId ? "" : undefined;
    if (draft.kind === "rest") return { startTime: clear, endTime: clear, latestStartTime: clear, requiredHours: clear };
    if (draft.pattern === "flexible") {
      return { startTime: draft.startTime, latestStartTime: draft.latestStartTime, requiredHours: Number(draft.requiredHours), endTime: clear };
    }
    return { startTime: draft.startTime, endTime: draft.endTime, latestStartTime: clear, requiredHours: clear };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch(editingId ? `/api/attendance/shifts/${editingId}` : "/api/attendance/shifts", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId,
        name: draft.name,
        code: draft.code,
        kind: draft.kind,
        pattern: draft.kind === "work" ? draft.pattern : "fixed",
        color: draft.color,
        ...timesPayload(),
      }),
    });

    setIsSubmitting(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to save the shift.");
      return;
    }
    resetForm();
    toast.success("Shift saved");
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
    toast.success("Shift saved");
    router.refresh();
  }

  const preview = shiftColor(draft.color);

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
      <DialogContent className="sm:max-w-lg">
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
            <SegmentedControl
              label="Shift type"
              value={draft.kind}
              onChange={setKind}
              options={[
                { value: "work", label: "Work shift" },
                { value: "rest", label: "Rest day" },
              ]}
            />
          </div>

          {draft.kind === "work" && (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Hours</span>
              <SegmentedControl
                label="Shift hours"
                value={draft.pattern}
                onChange={(pattern) => setDraft({ ...draft, pattern })}
                options={[
                  { value: "fixed", label: "Fixed hours" },
                  { value: "flexible", label: "Flexi-time" },
                ]}
              />
            </div>
          )}

          {draft.kind === "work" && draft.pattern === "fixed" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Starts" htmlFor="shift-start" required>
                  <Input id="shift-start" type="time" value={draft.startTime} onChange={(event) => setDraft({ ...draft, startTime: event.target.value })} required />
                </FormField>
                <FormField label="Ends" htmlFor="shift-end" required>
                  <Input id="shift-end" type="time" value={draft.endTime} onChange={(event) => setDraft({ ...draft, endTime: event.target.value })} required />
                </FormField>
              </div>
              {draft.endTime < draft.startTime && <p className="-mt-2 text-xs text-muted-foreground">Ends the next morning (overnight shift).</p>}
            </>
          )}

          {draft.kind === "work" && draft.pattern === "flexible" && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <FormField label="Earliest start" htmlFor="shift-flex-start" required>
                  <Input id="shift-flex-start" type="time" value={draft.startTime} onChange={(event) => setDraft({ ...draft, startTime: event.target.value })} required />
                </FormField>
                <FormField label="Latest start" htmlFor="shift-flex-latest" required>
                  <Input
                    id="shift-flex-latest"
                    type="time"
                    value={draft.latestStartTime}
                    onChange={(event) => setDraft({ ...draft, latestStartTime: event.target.value })}
                    required
                  />
                </FormField>
                <FormField label="Hours to work" htmlFor="shift-flex-hours" required>
                  <Input
                    id="shift-flex-hours"
                    type="number"
                    inputMode="decimal"
                    min={1}
                    max={16}
                    step={0.5}
                    value={draft.requiredHours}
                    onChange={(event) => setDraft({ ...draft, requiredHours: event.target.value })}
                    placeholder="e.g. 8"
                    required
                  />
                </FormField>
              </div>
              <p className="-mt-2 text-xs text-muted-foreground">Employees start any time in the window and work the set hours.</p>
            </>
          )}

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">Color</span>
              <span className={cn("inline-flex min-w-9 justify-center rounded-md px-1.5 py-0.5 font-mono text-xs font-semibold", preview.cellClassName)} aria-hidden="true">
                {draft.code || "D"}
              </span>
            </div>
            <div role="radiogroup" aria-label="Shift color" className="flex flex-wrap gap-2">
              {SHIFT_COLORS.map((color) => {
                const selected = draft.color === color.key;
                return (
                  <button
                    key={color.key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={color.label}
                    title={color.label}
                    onClick={() => {
                      setColorChosen(true);
                      setDraft({ ...draft, color: color.key });
                    }}
                    className={cn(
                      "flex size-7 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition-[box-shadow,transform] duration-150 hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      color.swatchClassName,
                      selected && "ring-2 ring-foreground",
                    )}
                  >
                    {selected && <Check className="size-3.5 text-white" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </div>

          <FormError message={error} />
          <div className="flex justify-end gap-2">
            {editingId && (
              <Button type="button" variant="ghost" onClick={resetForm} icon={X}>
                Cancel edit
              </Button>
            )}
            <Button type="submit" data-testid="shift-submit-button" icon={Save} pending={isSubmitting} pendingLabel="Saving…">
              {editingId ? "Save changes" : "Add shift"}
            </Button>
          </div>
        </form>

        {shifts.length > 0 && (
          <ul className="-mx-4 divide-y border-t" data-testid="shift-list">
            {shifts.map((shift) => (
              <li key={shift.id} className={cn("flex items-center gap-3 px-4 py-2.5", editingId === shift.id && "bg-accent/50")}>
                <span className={cn("inline-flex min-w-9 justify-center rounded-md px-1.5 py-0.5 font-mono text-xs font-semibold", shiftColor(shift.color).cellClassName)}>
                  {shift.code}
                </span>
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
                  icon={shift.status === "active" ? Ban : RotateCcw}
                  pending={togglingId === shift.id}
                  onClick={() => toggleStatus(shift)}
                  aria-label={shift.status === "active" ? `Deactivate ${shift.name}` : `Reactivate ${shift.name}`}
                />
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
