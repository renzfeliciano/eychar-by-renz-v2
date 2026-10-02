"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarDays, MousePointerClick, NotebookPen, Pencil, Plus, Trash2, Users, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormError } from "@/components/shared/form-field";
import { cn } from "@/lib/utils";
import { formatDateKey } from "@/lib/date-key";
import { isDayOff } from "@/domains/holidays/holiday-types";
import type { DayInfo } from "@/domains/holidays/day-info";
import type { DayHeadcount } from "@/domains/attendance/day-headcount";
import { shiftColor } from "@/domains/attendance/shift-colors";
import { HolidayBadge } from "./holiday-badge";
import { AddHolidayForm, HolidayForm } from "./add-holiday-form";

type Props = {
  organizationId: string;
  date: string | null;
  onOpenChange: (open: boolean) => void;
  info: DayInfo | undefined;
  headcount: DayHeadcount | null;
  isToday: boolean;
  isWeekend: boolean;
  canUpdate: boolean;
  canReadEvents: boolean;
  /** Select every visible employee on this day in the grid (editors only). */
  onSelectDay: () => void;
};

function Section({ icon: Icon, title, children, testId }: { icon: React.ElementType; title: string; children: React.ReactNode; testId?: string }) {
  return (
    <section className="flex flex-col gap-2" data-testid={testId}>
      <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <Icon className="size-3.5" aria-hidden="true" />
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * What's going on that day, opened from a date in the Schedules grid:
 * its holidays (from the organization's holiday calendar), who's working,
 * company events, and HR's own note. Editors can add a holiday, keep the
 * note, and still select the whole day to schedule it.
 */
export function DayDetailsDialog({ organizationId, date, onOpenChange, info, headcount, isToday, isWeekend, canUpdate, canReadEvents, onSelectDay }: Props) {
  const router = useRouter();
  const [addingHoliday, setAddingHoliday] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [note, setNote] = useState(info?.note ?? "");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [isSavingNote, setIsSavingNote] = useState(false);

  const holidays = info?.holidays ?? [];
  const events = info?.events ?? [];
  const savedNote = info?.note ?? "";
  const noteChanged = note.trim() !== savedNote;
  const dayOff = holidays.some((holiday) => isDayOff(holiday.type));

  async function saveNote() {
    if (!date) return;
    setNoteError(null);
    setIsSavingNote(true);
    const response = await fetch("/api/attendance/day-notes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, date, note: note.trim() }),
    });
    setIsSavingNote(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setNoteError(body.error ?? "Failed to save the note.");
      return;
    }
    toast.success(note.trim() ? "Note saved" : "Note cleared");
    router.refresh();
  }

  async function removeHoliday(id: string, name: string) {
    const response = await fetch(`/api/holidays/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      toast.error(body.error ?? "Failed to remove the holiday.");
      throw new Error(body.error ?? "Failed to remove the holiday.");
    }
    toast.success(`Removed ${name}`);
    router.refresh();
  }

  const summary = holidays.length
    ? dayOff
      ? "Holiday · normally a day off"
      : "Special working day · work as usual"
    : isWeekend
      ? "Weekend"
      : "Regular work day";

  return (
    <Dialog open={date !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="day-details-dialog">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {date ? formatDateKey(date, { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : ""}
            {isToday && <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">Today</span>}
          </DialogTitle>
          <DialogDescription>{summary}</DialogDescription>
        </DialogHeader>

        <div className="-mx-4 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-1">
          <Section icon={CalendarDays} title="Holidays" testId="day-details-holidays">
            {holidays.length === 0 && !addingHoliday && <p className="text-sm text-muted-foreground">Not a holiday on your calendar.</p>}
            {holidays.length > 0 && (
              <ul className="flex flex-col divide-y rounded-lg border">
                {holidays.map((holiday) =>
                  editingId === holiday.id ? (
                    <li key={holiday.id} className="p-2">
                      <HolidayForm
                        organizationId={organizationId}
                        holiday={holiday}
                        onCancel={() => setEditingId(null)}
                        onSaved={() => {
                          setEditingId(null);
                          router.refresh();
                        }}
                      />
                    </li>
                  ) : (
                  <li key={holiday.id} className="flex items-start gap-3 px-3 py-2.5">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="text-sm font-medium">{holiday.name}</span>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <HolidayBadge type={holiday.type} />
                        <span>{holiday.scope ?? "Nationwide"}</span>
                        {holiday.source && <span className="basis-full">{holiday.source}</span>}
                      </span>
                    </div>
                    {canUpdate && (
                      <span className="flex shrink-0 items-center">
                      <Button size="icon-sm" variant="ghost" aria-label={`Edit ${holiday.name}`} title="Edit" onClick={() => setEditingId(holiday.id)} data-testid={`day-details-edit-${holiday.id}`}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <ConfirmDialog
                        trigger={
                          <Button size="icon-sm" variant="ghost" aria-label={`Remove ${holiday.name}`} title="Remove from the calendar">
                            <Trash2 className="size-3.5" />
                          </Button>
                        }
                        title={`Remove ${holiday.name}?`}
                        description="It comes off your holiday calendar. Scheduled shifts and recorded attendance aren't changed."
                        confirmLabel="Remove"
                        confirmLoadingLabel="Removing…"
                        onConfirm={() => removeHoliday(holiday.id, holiday.name)}
                      />
                      </span>
                    )}
                  </li>
                  ),
                )}
              </ul>
            )}
            {canUpdate && date && (addingHoliday ? (
              <AddHolidayForm
                organizationId={organizationId}
                date={date}
                onCancel={() => setAddingHoliday(false)}
                onSaved={() => {
                  setAddingHoliday(false);
                  router.refresh();
                }}
              />
            ) : (
              <Button type="button" size="sm" variant="outline" className="self-start" onClick={() => setAddingHoliday(true)} data-testid="day-details-add-holiday">
                <Plus className="size-3.5" />
                Add a holiday on this day
              </Button>
            ))}
          </Section>

          {headcount && (
            <Section icon={Users} title="On the schedule" testId="day-details-headcount">
              <dl className="grid grid-cols-3 gap-2">
                {[
                  { label: "Working", value: headcount.working },
                  { label: "Off", value: headcount.off },
                  { label: "Not scheduled", value: headcount.unscheduled },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-lg border px-3 py-2">
                    <dt className="text-xs text-muted-foreground">{stat.label}</dt>
                    <dd className="text-lg font-semibold tabular-nums">{stat.value}</dd>
                  </div>
                ))}
              </dl>
              {headcount.byShift.length > 0 && (
                <ul className="flex flex-wrap gap-1.5" aria-label="By shift">
                  {headcount.byShift.map((shift) => (
                    <li key={shift.code} className="flex items-center gap-1.5 rounded-md border px-1.5 py-1 text-xs">
                      <span className={cn("inline-flex min-w-7 justify-center rounded px-1 font-mono font-semibold", shiftColor(shift.color).cellClassName)}>{shift.code}</span>
                      <span className="text-muted-foreground">{shift.name}</span>
                      <span className="font-medium tabular-nums">{shift.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}

          {canReadEvents && (
            <Section icon={CalendarDays} title="Company events" testId="day-details-events">
              {events.length === 0 ? (
                <p className="text-sm text-muted-foreground">No events.</p>
              ) : (
                <ul className="flex flex-col divide-y rounded-lg border">
                  {events.map((event) => (
                    <li key={event.id} className="flex items-baseline gap-3 px-3 py-2 text-sm">
                      <span className="w-12 shrink-0 text-xs text-muted-foreground tabular-nums">{event.time ?? "All day"}</span>
                      <span className="min-w-0 flex-1 font-medium">{event.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{event.category}</span>
                    </li>
                  ))}
                </ul>
              )}
              {date && (
                <Link href={`/events?month=${date.slice(0, 7)}`} className="self-start text-xs font-medium text-primary underline-offset-4 hover:underline">
                  Open the company calendar
                </Link>
              )}
            </Section>
          )}

          <Section icon={NotebookPen} title="HR note" testId="day-details-note">
            {canUpdate ? (
              <div className="flex flex-col gap-2">
                <Textarea
                  aria-label="Note for this day"
                  placeholder="e.g. Typhoon signal no. 2: skeleton crew only"
                  value={note}
                  maxLength={500}
                  onChange={(event) => setNote(event.target.value)}
                  className="min-h-20"
                  data-testid="day-details-note-input"
                />
                <FormError message={noteError} />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground tabular-nums">{note.length}/500</span>
                  <Button type="button" size="sm" variant="secondary" onClick={saveNote} disabled={isSavingNote || !noteChanged} data-testid="day-details-note-save" icon={Save} pending={isSavingNote} pendingLabel="Saving…">
                    {note.trim() || !savedNote ? "Save note" : "Clear note"}
                  </Button>
                </div>
              </div>
            ) : savedNote ? (
              <p className="text-sm whitespace-pre-wrap">{savedNote}</p>
            ) : (
              <p className="text-sm text-muted-foreground">No note.</p>
            )}
          </Section>
        </div>

        {canUpdate && (
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onSelectDay();
                onOpenChange(false);
              }}
              data-testid="day-details-select-day"
            >
              <MousePointerClick className="size-3.5" />
              Select everyone on this day
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
