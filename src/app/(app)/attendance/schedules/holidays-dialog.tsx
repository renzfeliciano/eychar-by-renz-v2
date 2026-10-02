"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BadgeCheck, ChevronLeft, ChevronRight, Download, Flag, Info, Loader2, Pencil, Plus, Trash2, TriangleAlert, ArrowLeft, Check, CheckCheck, Eraser, Save } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormError } from "@/components/shared/form-field";
import { cn } from "@/lib/utils";
import { formatDateKey } from "@/lib/date-key";
import type { HolidayType, HolidayView } from "@/domains/holidays/holiday-types";
import { HolidayBadge } from "./holiday-badge";
import { AddHolidayForm, HolidayForm } from "./add-holiday-form";

type PreviewEntry = { date: string; name: string; type: HolidayType; source: string; alreadyAdded: boolean };
type Preview = { year: number; country: string; verified: boolean; basis: string; notes: string[]; entries: PreviewEntry[] };

const PRESET = "PH";

/**
 * The organization's holiday calendar for a year, kept from the Schedules
 * page: load the official Philippine list (reviewed before saving), add
 * local or newly proclaimed days, and take wrong ones off.
 */
export function HolidaysDialog({ organizationId, initialYear }: { organizationId: string; initialYear: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(initialYear);
  const [holidays, setHolidays] = useState<HolidayView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  async function load(forYear: number = year) {
    setLoadError(null);
    const response = await fetch(`/api/holidays?organizationId=${organizationId}&year=${forYear}`);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setLoadError(body.error ?? "Couldn't load the holidays.");
      return;
    }
    const body = (await response.json()) as { holidays: HolidayView[] };
    setHolidays(body.holidays);
  }

  /** Shows a year afresh: its saved holidays, no preview or form open. */
  function showYear(nextYear: number) {
    setYear(nextYear);
    setHolidays(null);
    setPreview(null);
    setAdding(false);
    setEditingId(null);
    void load(nextYear);
  }

  async function openPreview() {
    setImportError(null);
    setIsPreviewing(true);
    const response = await fetch(`/api/holidays/presets?organizationId=${organizationId}&preset=${PRESET}&year=${year}`);
    setIsPreviewing(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      toast.error(body.error ?? "Couldn't load the holiday list.");
      return;
    }
    const body = (await response.json()) as { preview: Preview };
    setPreview(body.preview);
    setPicked(new Set(body.preview.entries.filter((entry) => !entry.alreadyAdded).map((entry) => entry.date)));
  }

  async function importPicked() {
    if (!preview) return;
    setImportError(null);
    setIsImporting(true);
    const response = await fetch("/api/holidays/presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, preset: PRESET, year, dates: [...picked] }),
    });
    setIsImporting(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setImportError(body.error ?? "Failed to save the holidays.");
      return;
    }
    const result = (await response.json()) as { added: number; skipped: number };
    toast.success(result.added === 1 ? "Added 1 holiday" : `Added ${result.added} holidays`);
    setPreview(null);
    await load();
    router.refresh();
  }

  async function removeHoliday(holiday: HolidayView) {
    const response = await fetch(`/api/holidays/${holiday.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      toast.error(body.error ?? "Failed to remove the holiday.");
      throw new Error(body.error ?? "Failed to remove the holiday.");
    }
    toast.success(`Removed ${holiday.name}`);
    await load();
    router.refresh();
  }

  const selectable = preview?.entries.filter((entry) => !entry.alreadyAdded) ?? [];
  const alreadyCount = (preview?.entries.length ?? 0) - selectable.length;
  // Loaded before: every day of the list is already saved, so there's nothing to pick.
  const upToDate = preview !== null && selectable.length === 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) showYear(year);
        setOpen(next);
      }}
    >
      <DialogTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }))} data-testid="schedule-holidays-button">
        <Flag className="size-3.5" />
        Holidays
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Holiday calendar</DialogTitle>
          <DialogDescription>Your organization&apos;s holidays. They show on the schedule&apos;s dates; click a date to see them with that day&apos;s notes.</DialogDescription>
        </DialogHeader>

        {/* Wraps onto two lines on narrow screens instead of running past the dialog's edge. */}
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2">
          <div className="flex items-center gap-1">
            <Button size="icon-sm" variant="ghost" onClick={() => showYear(year - 1)} aria-label="Previous year" disabled={isImporting}>
              <ChevronLeft className="size-4" />
            </Button>
            <span className="w-12 text-center text-sm font-semibold tabular-nums" data-testid="holidays-year">
              {year}
            </span>
            <Button size="icon-sm" variant="ghost" onClick={() => showYear(year + 1)} aria-label="Next year" disabled={isImporting}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
          {!preview && (
            <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => setAdding((value) => !value)} data-testid="holidays-add-toggle">
                <Plus className="size-3.5" />
                Add
              </Button>
              <Button size="sm" variant="outline" onClick={openPreview} data-testid="holidays-load-ph" icon={Download} pending={isPreviewing} pendingLabel="Loading…">
                {<>
                    <span className="min-[420px]:hidden">Load PH holidays</span>
                    <span className="hidden min-[420px]:inline">Load Philippine holidays</span>
                  </>}
              </Button>
            </div>
          )}
        </div>

        <div className="-mx-4 min-h-0 flex-1 overflow-y-auto border-y px-4 py-3">
          {preview ? (
            <div className="flex flex-col gap-3" data-testid="holidays-preview">
              <div className={cn("flex gap-2.5 rounded-lg border p-3 text-sm", preview.verified ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10" : "border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10")}>
                {preview.verified ? <BadgeCheck className="mt-0.5 size-4 shrink-0 text-emerald-700 dark:text-emerald-300" aria-hidden="true" /> : <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />}
                <div className="flex flex-col gap-1">
                  <p className="font-medium">{preview.verified ? `Official ${preview.country} holidays for ${preview.year}` : `Standard ${preview.country} holidays for ${preview.year} (check before saving)`}</p>
                  <p className="text-muted-foreground">{preview.basis}</p>
                  {preview.notes.map((note) => (
                    <p key={note} className="flex gap-1.5 text-xs text-muted-foreground">
                      <Info className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                      {note}
                    </p>
                  ))}
                </div>
              </div>
              {upToDate ? (
                <p className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2.5 text-sm" data-testid="holidays-preview-up-to-date">
                  <BadgeCheck className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  <span>
                    All {preview.entries.length} holidays for {preview.year} are already on your calendar. Nothing new to add.
                  </span>
                </p>
              ) : (
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-muted-foreground tabular-nums">
                    {picked.size} of {selectable.length} new selected
                    {alreadyCount > 0 && <span className="font-normal"> · {alreadyCount} already on your calendar</span>}
                  </span>
                  <span className="flex shrink-0 gap-1">
                    <Button size="xs" variant="ghost" onClick={() => setPicked(new Set(selectable.map((entry) => entry.date)))} icon={CheckCheck}>
                      Select all
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => setPicked(new Set())} icon={Eraser}>
                      Clear
                    </Button>
                  </span>
                </div>
              )}
              <ul className="divide-y rounded-lg border">
                {preview.entries.map((entry) => {
                  const inputId = `preset-${entry.date}-${entry.name}`;
                  return (
                    <li key={inputId}>
                      <label htmlFor={inputId} className={cn("flex items-center gap-3 px-3 py-2", entry.alreadyAdded ? "opacity-60" : "cursor-pointer hover:bg-muted/50")}>
                        <input
                          id={inputId}
                          type="checkbox"
                          className="size-4 shrink-0 accent-primary"
                          disabled={entry.alreadyAdded}
                          checked={entry.alreadyAdded || picked.has(entry.date)}
                          onChange={(event) =>
                            setPicked((current) => {
                              const next = new Set(current);
                              if (event.target.checked) next.add(entry.date);
                              else next.delete(entry.date);
                              return next;
                            })
                          }
                        />
                        <span className="w-24 shrink-0 text-xs text-muted-foreground tabular-nums">{formatDateKey(entry.date, { weekday: "short", month: "short", day: "numeric" })}</span>
                        <span className="min-w-0 flex-1 text-sm">{entry.name}</span>
                        {entry.alreadyAdded ? (
                          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                            <BadgeCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                            Saved
                          </span>
                        ) : (
                          <HolidayBadge type={entry.type} className="hidden sm:inline-flex" />
                        )}
                      </label>
                    </li>
                  );
                })}
              </ul>
              <FormError message={importError} />
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {adding && (
                <AddHolidayForm
                  organizationId={organizationId}
                  onCancel={() => setAdding(false)}
                  onSaved={() => {
                    setAdding(false);
                    void load();
                    router.refresh();
                  }}
                />
              )}
              {loadError && <FormError message={loadError} />}
              {!holidays && !loadError && (
                <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Loading holidays…
                </p>
              )}
              {holidays?.length === 0 && (
                <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground" data-testid="holidays-empty">
                  No holidays for {year} yet. Load the Philippine list, or add your own.
                </p>
              )}
              {holidays && holidays.length > 0 && (
                <ul className="divide-y rounded-lg border" data-testid="holidays-list">
                  {holidays.map((holiday) =>
                    editingId === holiday.id ? (
                      <li key={holiday.id} className="p-2">
                        <HolidayForm
                          organizationId={organizationId}
                          holiday={holiday}
                          onCancel={() => setEditingId(null)}
                          onSaved={() => {
                            setEditingId(null);
                            void load();
                            router.refresh();
                          }}
                        />
                      </li>
                    ) : (
                    <li key={holiday.id} className="flex items-center gap-3 px-3 py-2">
                      <span className="w-24 shrink-0 text-xs text-muted-foreground tabular-nums">{formatDateKey(holiday.date, { weekday: "short", month: "short", day: "numeric" })}</span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm">{holiday.name}</span>
                        {holiday.scope && <span className="truncate text-xs text-muted-foreground">{holiday.scope}</span>}
                      </span>
                      <HolidayBadge type={holiday.type} className="hidden sm:inline-flex" />
                      <Button size="icon-sm" variant="ghost" aria-label={`Edit ${holiday.name}`} title="Edit" onClick={() => setEditingId(holiday.id)} data-testid={`holiday-edit-${holiday.id}`}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <ConfirmDialog
                        trigger={
                          <Button size="icon-sm" variant="ghost" aria-label={`Remove ${holiday.name}`}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        }
                        title={`Remove ${holiday.name}?`}
                        description="It comes off your holiday calendar. Scheduled shifts and recorded attendance aren't changed."
                        confirmLabel="Remove"
                        confirmLoadingLabel="Removing…"
                        onConfirm={() => removeHoliday(holiday)}
                      />
                    </li>
                    ),
                  )}
                </ul>
              )}
            </div>
          )}
        </div>

        {preview && (
          <DialogFooter>
            {upToDate ? (
              <Button onClick={() => setPreview(null)} data-testid="holidays-preview-done" icon={Check}>
                Done
              </Button>
            ) : (
              <>
                <Button variant="ghost" onClick={() => setPreview(null)} disabled={isImporting} icon={ArrowLeft}>
                  Back
                </Button>
                <Button onClick={importPicked} disabled={picked.size === 0} icon={Save} pending={isImporting} pendingLabel="Saving…" data-testid="holidays-import-submit">
                  {picked.size === 0 ? "Pick holidays to save" : picked.size === 1 ? "Save 1 holiday" : `Save ${picked.size} holidays`}
                </Button>
              </>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
