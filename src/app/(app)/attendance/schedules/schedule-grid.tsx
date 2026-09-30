"use client";

import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eraser, Loader2, MousePointerClick, Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OptionSelect, type SelectOption } from "@/components/shared/option-select";
import { FormError } from "@/components/shared/form-field";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { cn } from "@/lib/utils";
import type { ScheduleMonthView } from "@/domains/attendance/schedule-service";
import { shiftColor } from "@/domains/attendance/shift-colors";
import { formatHours, type ShiftOption } from "./shift-templates-dialog";

const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const cellKey = (employeeId: string, date: string) => `${employeeId}|${date}`;

type Props = {
  organizationId: string;
  view: ScheduleMonthView;
  shifts: ShiftOption[];
  projects: SelectOption[];
  canUpdate: boolean;
  todayKey: string;
};

type CellPosition = { employeeId: string; dayIndex: number };
type EntryPayload = { employeeId: string; date: string; shiftTemplateId: string | null; projectId?: string; startTime?: string; endTime?: string };

// A drag paints a rectangle on top of whatever was selected when it began;
// starting on an already-selected day erases instead, like a spreadsheet.
type DragState = { start: CellPosition; base: Set<string>; mode: "add" | "remove"; moved: boolean };

export function ScheduleGrid({ organizationId, view, shifts, projects, canUpdate, todayKey }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<CellPosition | null>(null);
  const [query, setQuery] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const [shiftId, setShiftId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [customHours, setCustomHours] = useState(false);
  const [customStart, setCustomStart] = useState("08:00");
  const [customEnd, setCustomEnd] = useState("17:00");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [quickSavingId, setQuickSavingId] = useState<string | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);

  const activeShifts = shifts.filter((shift) => shift.status === "active");
  const chosenShift = activeShifts.find((shift) => shift.id === shiftId);
  const activeProjectIds = useMemo(() => new Set(projects.map((project) => project.id)), [projects]);
  const cellsByEmployee = useMemo(() => new Map(view.rows.map((row) => [row.employeeId, row.cells])), [view.rows]);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleRows = normalizedQuery
    ? view.rows.filter((row) => row.name.toLowerCase().includes(normalizedQuery) || row.employeeNumber.toLowerCase().includes(normalizedQuery))
    : view.rows;

  /** Every day between two cells, across every visible employee between them. */
  function blockKeys(from: CellPosition, to: CellPosition): string[] {
    const fromRow = visibleRows.findIndex((row) => row.employeeId === from.employeeId);
    const toRow = visibleRows.findIndex((row) => row.employeeId === to.employeeId);
    if (fromRow < 0 || toRow < 0) return [cellKey(to.employeeId, view.days[to.dayIndex].date)];
    const [rowStart, rowEnd] = fromRow < toRow ? [fromRow, toRow] : [toRow, fromRow];
    const [dayStart, dayEnd] = from.dayIndex < to.dayIndex ? [from.dayIndex, to.dayIndex] : [to.dayIndex, from.dayIndex];
    const keys: string[] = [];
    for (let r = rowStart; r <= rowEnd; r++) {
      for (let d = dayStart; d <= dayEnd; d++) keys.push(cellKey(visibleRows[r].employeeId, view.days[d].date));
    }
    return keys;
  }

  function clearSelection() {
    setSelected(new Set());
    setAnchor(null);
  }

  function handleCellClick(position: CellPosition, extendRange: boolean) {
    // The click that ends a drag lands on the last cell; the drag already selected it.
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setSelected((current) => {
      const next = new Set(current);
      if (extendRange && anchor) {
        for (const key of blockKeys(anchor, position)) next.add(key);
      } else {
        const key = cellKey(position.employeeId, view.days[position.dayIndex].date);
        if (next.has(key)) next.delete(key);
        else next.add(key);
      }
      return next;
    });
    setAnchor(position);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>, position: CellPosition) {
    // Touch keeps its native sideways scroll of the grid; taps and the row/column headers cover selection there.
    if (event.pointerType === "touch" || event.button > 0 || event.shiftKey) return;
    const key = cellKey(position.employeeId, view.days[position.dayIndex].date);
    dragRef.current = { start: position, base: new Set(selected), mode: selected.has(key) ? "remove" : "add", moved: false };

    const endDrag = () => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (drag?.moved) {
        suppressClickRef.current = true;
        // Released outside a cell means no click follows to consume the flag.
        setTimeout(() => (suppressClickRef.current = false), 0);
      }
    };
    window.addEventListener("pointerup", endDrag, { once: true });
  }

  function handlePointerEnter(position: CellPosition) {
    const drag = dragRef.current;
    if (!drag) return;
    if (!drag.moved && drag.start.employeeId === position.employeeId && drag.start.dayIndex === position.dayIndex) return;
    drag.moved = true;
    const next = new Set(drag.base);
    for (const key of blockKeys(drag.start, position)) {
      if (drag.mode === "add") next.add(key);
      else next.delete(key);
    }
    setSelected(next);
    setAnchor(position);
  }

  // Row/column headers toggle as a group: select all, or deselect if already all selected.
  function toggleGroup(keys: string[]) {
    setSelected((current) => {
      const next = new Set(current);
      const allSelected = keys.every((key) => next.has(key));
      for (const key of keys) {
        if (allSelected) next.delete(key);
        else next.add(key);
      }
      return next;
    });
  }

  function selectedPositions() {
    return [...selected].map((key) => {
      const [employeeId, date] = key.split("|");
      return { employeeId, date };
    });
  }

  async function save(entries: EntryPayload[], cleared: boolean) {
    const response = await fetch("/api/attendance/schedules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, entries }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error ?? "Failed to save the schedule.");
    }
    const days = entries.length === 1 ? "1 day" : `${entries.length} days`;
    toast.success(cleared ? `Cleared ${days}` : `Scheduled ${days}`);
    clearSelection();
    router.refresh();
  }

  // One-click apply: each work day keeps the site it already had (when that
  // project is still active), so swapping D for N doesn't wipe the plan.
  async function applyQuick(shift: ShiftOption) {
    const entries = selectedPositions().map(({ employeeId, date }) => {
      const existingProject = cellsByEmployee.get(employeeId)?.[date]?.projectId;
      const keepProject = shift.kind === "work" && existingProject && activeProjectIds.has(existingProject);
      return { employeeId, date, shiftTemplateId: shift.id, ...(keepProject ? { projectId: existingProject } : {}) };
    });
    setQuickSavingId(shift.id);
    try {
      await save(entries, false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save the schedule.");
    } finally {
      setQuickSavingId(null);
    }
  }

  async function handleAssign() {
    if (!shiftId) {
      setError("Choose a shift.");
      return;
    }
    const isWork = chosenShift?.kind === "work";
    if (isWork && customHours && (!customStart || !customEnd || customStart === customEnd)) {
      setError("Enter a custom start and end that aren't the same.");
      return;
    }
    setError(null);
    setIsSaving(true);
    const project = isWork ? projectId : "";
    const hours = isWork && customHours ? { startTime: customStart, endTime: customEnd } : {};
    try {
      await save(
        selectedPositions().map(({ employeeId, date }) => ({ employeeId, date, shiftTemplateId: shiftId, ...(project ? { projectId: project } : {}), ...hours })),
        false,
      );
      setAssignOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save the schedule.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && selected.size > 0) clearSelection();
  }

  if (view.rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground" data-testid="schedule-empty">
        No one is on the schedule yet. Add active employees, or put them on the schedule from Roster.
      </p>
    );
  }

  const selectionCount = selected.size;
  const isBusy = isSaving || quickSavingId !== null;

  return (
    <div className="flex flex-col gap-3" onKeyDown={handleKeyDown}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-64 sm:shrink-0">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            aria-label="Find employee"
            placeholder="Find by name or employee #"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setAnchor(null);
            }}
            className="pl-8"
            data-testid="schedule-search-input"
          />
        </div>
        {canUpdate && (
          <p className="flex items-start gap-2 text-sm text-muted-foreground sm:max-w-2xl sm:text-right" data-testid="schedule-hint">
            <MousePointerClick className="mt-0.5 size-4 shrink-0 sm:hidden" aria-hidden="true" />
            <span>
              {activeShifts.length === 0
                ? "Add shifts first (Shifts button above), then select days to schedule."
                : "Select days to schedule. Shift-click selects a range; click a name or date to select the whole row or column."}
              {activeShifts.length > 0 && <span className="hidden md:inline"> Drag across days to select a block; Esc deselects.</span>}
            </span>
          </p>
        )}
      </div>

      {/* The grid scrolls sideways inside its own frame on narrow screens; the page itself never does. */}
      <div className="overflow-x-auto rounded-xl border bg-card shadow-[var(--shadow-soft)]" data-testid="schedule-grid">
        <table className="w-max border-separate border-spacing-0 text-sm select-none">
          <caption className="sr-only">Shift schedule for {view.label}</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-20 min-w-32 border-b border-r bg-card px-3 py-2 text-left text-xs font-medium text-muted-foreground sm:min-w-52">
                Employee
              </th>
              {view.days.map((day) => {
                const isToday = day.date === todayKey;
                const content = (
                  <>
                    <span
                      className={cn(
                        "mx-auto flex size-5 items-center justify-center rounded-full text-xs tabular-nums",
                        isToday ? "bg-primary font-semibold text-primary-foreground" : "font-medium",
                      )}
                    >
                      {day.day}
                    </span>
                    <span className="block text-[10px] text-muted-foreground">{WEEKDAY_INITIALS[day.weekday]}</span>
                  </>
                );
                return (
                  <th
                    key={day.date}
                    scope="col"
                    className={cn("h-11 w-11 min-w-11 border-b p-0 text-center font-normal", day.isWeekend && "bg-muted/60")}
                    aria-label={`${WEEKDAY_NAMES[day.weekday]} ${day.day}${isToday ? ", today" : ""}`}
                  >
                    {canUpdate ? (
                      <button
                        type="button"
                        className="size-full rounded-none transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
                        onClick={() => toggleGroup(visibleRows.map((row) => cellKey(row.employeeId, day.date)))}
                        title={`Select everyone on ${day.date}`}
                      >
                        {content}
                      </button>
                    ) : (
                      content
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={view.days.length + 1} className="px-3 py-8 text-left text-sm text-muted-foreground sm:text-center">
                  No one matches &ldquo;{query.trim()}&rdquo;.
                </td>
              </tr>
            )}
            {visibleRows.map((row) => {
              const workDays = Object.values(row.cells).filter((cell) => cell.kind === "work").length;
              const nameContent = (
                <>
                  <span className="block max-w-28 truncate text-sm font-medium sm:max-w-48">{row.name}</span>
                  <span className="block max-w-28 truncate text-xs text-muted-foreground tabular-nums sm:max-w-48">
                    {row.employeeNumber}
                    <span className="hidden sm:inline"> · {workDays === 1 ? "1 work day" : `${workDays} work days`}</span>
                  </span>
                </>
              );
              return (
                <tr key={row.employeeId} data-testid={`schedule-row-${row.employeeId}`}>
                  <th scope="row" className="sticky left-0 z-10 border-r border-b bg-card p-0 text-left font-normal">
                    {canUpdate ? (
                      <button
                        type="button"
                        className="flex size-full flex-col items-start px-3 py-1.5 text-left transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
                        onClick={() => toggleGroup(view.days.map((day) => cellKey(row.employeeId, day.date)))}
                        title={`Select all of ${row.name}'s days`}
                      >
                        {nameContent}
                      </button>
                    ) : (
                      <div className="px-3 py-1.5">{nameContent}</div>
                    )}
                  </th>
                  {view.days.map((day, dayIndex) => {
                    const cell = row.cells[day.date];
                    const position = { employeeId: row.employeeId, dayIndex };
                    const isSelected = selected.has(cellKey(row.employeeId, day.date));
                    const label = cell
                      ? `${row.name}, ${WEEKDAY_NAMES[day.weekday]} ${day.day}: ${cell.name}${cell.kind === "work" ? ` ${formatHours(cell)}` : ""}${cell.customTimes ? " (custom hours)" : ""}${cell.projectName ? ` at ${cell.projectName}` : ""}`
                      : `${row.name}, ${WEEKDAY_NAMES[day.weekday]} ${day.day}: not scheduled`;
                    const content = cell ? (
                      <>
                        {cell.customTimes && (
                          <span className="absolute top-1 right-1 size-1.5 rounded-full bg-current opacity-70" aria-hidden="true" data-testid="schedule-custom-marker" />
                        )}
                        <span className="block font-mono text-xs font-semibold">{cell.code}</span>
                        {cell.projectName && <span className="block max-w-10 truncate text-[9px] leading-tight opacity-75">{cell.projectName}</span>}
                      </>
                    ) : null;
                    // Each shift wears its own tint (the code is always printed too, so color is never the only cue).
                    const cellClass = cn(
                      "relative h-11 w-11 min-w-11 border-b border-background p-0 text-center align-middle",
                      !cell && "border-border",
                      day.isWeekend && !cell && "bg-muted/40",
                      cell && shiftColor(cell.color).cellClassName,
                    );
                    return (
                      <td key={day.date} className={cellClass} title={label}>
                        {canUpdate ? (
                          <button
                            type="button"
                            aria-label={label}
                            aria-pressed={isSelected}
                            onPointerDown={(event) => handlePointerDown(event, position)}
                            onPointerEnter={() => handlePointerEnter(position)}
                            onClick={(event) => handleCellClick(position, event.shiftKey)}
                            className={cn(
                              "relative flex size-full flex-col items-center justify-center transition-[background-color,box-shadow] duration-100 hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset dark:hover:bg-white/5",
                              isSelected && "bg-primary/12 ring-2 ring-primary ring-inset hover:bg-primary/15",
                            )}
                          >
                            {content}
                          </button>
                        ) : (
                          <div className="relative flex size-full flex-col items-center justify-center">{content}</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {activeShifts.length > 0 && (
        <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted-foreground" aria-label="Shift legend">
          {activeShifts.map((shift) => (
            <li key={shift.id} className="flex items-center gap-1.5">
              <span className={cn("inline-flex min-w-7 justify-center rounded px-1 font-mono font-semibold", shiftColor(shift.color).cellClassName)}>{shift.code}</span>
              {shift.name} · <span className="tabular-nums">{formatHours(shift)}</span>
            </li>
          ))}
          {view.rows.some((row) => Object.values(row.cells).some((cell) => cell.customTimes)) && (
            <li className="flex items-center gap-1.5">
              <span className="relative inline-flex size-4 rounded bg-muted" aria-hidden="true">
                <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-foreground/60" />
              </span>
              Custom hours that day
            </li>
          )}
        </ul>
      )}

      {/* Floating action bar: stays within reach however far down or across the grid the selection goes. */}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
        {canUpdate && selectionCount > 0 && (
          <div
            role="toolbar"
            aria-label="Selected days"
            className="pointer-events-auto flex max-w-full animate-in flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-2xl border bg-popover px-3 py-2 text-popover-foreground shadow-[var(--shadow-modal)] duration-200 ease-out fade-in slide-in-from-bottom-3"
            data-testid="schedule-action-bar"
          >
            <p className="pl-1 text-sm font-medium tabular-nums" data-testid="schedule-selection-count">
              {selectionCount === 1 ? "1 day selected" : `${selectionCount} days selected`}
            </p>

            {activeShifts.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 sm:border-l sm:pl-3" role="group" aria-label="Apply a shift">
                {activeShifts.map((shift) => (
                  <Button
                    key={shift.id}
                    size="sm"
                    variant="outline"
                    disabled={isBusy}
                    onClick={() => applyQuick(shift)}
                    aria-label={`Apply ${shift.code} · ${shift.name}`}
                    title={`${shift.name} · ${formatHours(shift)}`}
                    className={cn("min-w-10 border-transparent font-mono font-semibold hover:opacity-90", shiftColor(shift.color).cellClassName)}
                    data-testid={`schedule-quick-shift-${shift.code}`}
                  >
                    {quickSavingId === shift.id ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : shift.code}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isBusy}
                  onClick={() => {
                    setError(null);
                    setCustomHours(false);
                    setAssignOpen(true);
                  }}
                  data-testid="schedule-assign-button"
                >
                  <SlidersHorizontal className="size-3.5" />
                  More options…
                </Button>
              </div>
            )}

            <div className="flex items-center gap-1 sm:border-l sm:pl-3">
              <ConfirmDialog
                trigger={
                  <Button size="sm" variant="ghost" disabled={isBusy} data-testid="schedule-clear-button">
                    <Eraser className="size-3.5" />
                    Clear
                  </Button>
                }
                title={`Clear ${selectionCount === 1 ? "this day" : `${selectionCount} days`}?`}
                description={`${selectionCount === 1 ? "It goes" : "They go"} back to unscheduled. Attendance already recorded isn't affected.`}
                confirmLabel="Clear"
                confirmLoadingLabel="Clearing…"
                onConfirm={() =>
                  save(
                    selectedPositions().map(({ employeeId, date }) => ({ employeeId, date, shiftTemplateId: null })),
                    true,
                  )
                }
              />
              <Button size="icon-sm" variant="ghost" onClick={clearSelection} aria-label="Deselect all" title="Deselect (Esc)">
                <X className="size-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign shift</DialogTitle>
            <DialogDescription>
              Applies to the {selectionCount === 1 ? "selected day" : `${selectionCount} selected days`}, replacing whatever was scheduled there.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Shift</Label>
              <Select value={shiftId || null} onValueChange={(value) => setShiftId(value ?? "")}>
                <SelectTrigger className="w-full" data-testid="schedule-shift-select">
                  <SelectValue>{chosenShift ? `${chosenShift.code} · ${chosenShift.name} (${formatHours(chosenShift)})` : "Choose a shift"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {activeShifts.map((shift) => (
                    <SelectItem key={shift.id} value={shift.id}>
                      {shift.code} · {shift.name} ({formatHours(shift)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {chosenShift?.kind !== "rest" && (
              <OptionSelect label="Project" value={projectId} onChange={setProjectId} options={projects} placeholder="No specific project" testId="schedule-project-select" />
            )}
            {chosenShift?.kind === "work" && (
              <div className="flex flex-col gap-3 rounded-lg border p-3">
                <label className="flex items-start gap-2.5 text-sm">
                  <input type="checkbox" checked={customHours} onChange={(event) => setCustomHours(event.target.checked)} className="mt-0.5 size-4 shrink-0 accent-primary" />
                  <span>
                    <span className="font-medium">Custom hours for these days</span>
                    <span className="block text-xs text-muted-foreground">Keeps the {chosenShift.code} shift, with different start and end times on just these days.</span>
                  </span>
                </label>
                {customHours && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="schedule-custom-start">Starts</Label>
                      <Input id="schedule-custom-start" type="time" aria-label="Custom start" value={customStart} onChange={(event) => setCustomStart(event.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="schedule-custom-end">Ends</Label>
                      <Input id="schedule-custom-end" type="time" aria-label="Custom end" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} />
                    </div>
                  </div>
                )}
              </div>
            )}
            <FormError message={error} />
          </div>
          <DialogFooter>
            <Button onClick={handleAssign} disabled={isSaving} data-testid="schedule-assign-submit-button">
              {isSaving && <Loader2 className="size-3.5 animate-spin" />}
              {isSaving ? "Saving…" : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
