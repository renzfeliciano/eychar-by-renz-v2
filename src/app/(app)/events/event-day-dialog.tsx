"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { CalendarPlus, Pencil, Plus, Save, Trash2, ArrowLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { FormField, FormError, RequiredFieldsHint } from "@/components/shared/form-field";
import { OptionSelect, type SelectOption } from "@/components/shared/option-select";

export type EventItem = {
  id: string;
  title: string;
  time?: string | null;
  category: string;
  description?: string | null;
};

function formatDayTitle(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

type View = { mode: "list" } | { mode: "create" } | { mode: "edit"; event: EventItem };

export function EventDayDialog({
  organizationId,
  date,
  events,
  categories,
  categoryNameByCode,
  canManage,
  onClose,
  initialMode = "list",
}: {
  organizationId: string;
  date: string;
  events: EventItem[];
  categories: SelectOption[];
  categoryNameByCode: Map<string, string>;
  canManage: boolean;
  onClose: () => void;
  /** "create" opens straight into the new-event form (the calendar's New event button). */
  initialMode?: "list" | "create";
}) {
  const router = useRouter();
  const [view, setView] = useState<View>({ mode: initialMode });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  async function handleCancelEvent(event: EventItem) {
    setDeletingId(event.id);
    setListError(null);
    const response = await fetch(`/api/events/${event.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId }),
    });
    setDeletingId(null);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setListError(body.error ?? "Failed to cancel event.");
      return;
    }
    toast.success("Calendar updated");
    router.refresh();
  }

  if (view.mode === "list") {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{formatDayTitle(date)}</DialogTitle>
            <DialogDescription>Company-wide events scheduled for this day.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {events.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No events yet.</p>
            ) : (
              events.map((event) => (
                <div key={event.id} className="flex items-start justify-between gap-2 rounded-lg border p-3" data-testid={`event-row-${event.id}`}>
                  <div className="flex flex-col gap-0.5">
                    <p className="text-sm font-medium">{event.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {event.time ? `${event.time} · ` : ""}
                      {categoryNameByCode.get(event.category) ?? event.category}
                      {event.description ? ` · ${event.description}` : ""}
                    </p>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1">
                      <Button type="button" variant="ghost" size="sm" onClick={() => setView({ mode: "edit", event })} aria-label={`Edit ${event.title}`}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCancelEvent(event)}
                        disabled={deletingId === event.id}
                        aria-label={`Cancel ${event.title}`}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
            <FormError message={listError} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} icon={X}>
              Close
            </Button>
            {canManage && (
              <Button type="button" onClick={() => setView({ mode: "create" })} data-testid="add-event-button">
                <Plus className="size-3.5" />
                Add event
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <EventForm
      organizationId={organizationId}
      date={date}
      categories={categories}
      initialValue={view.mode === "edit" ? view.event : undefined}
      onBack={() => setView({ mode: "list" })}
      onClose={onClose}
    />
  );
}

function EventForm({
  organizationId,
  date,
  categories,
  initialValue,
  onBack,
  onClose,
}: {
  organizationId: string;
  date: string;
  categories: SelectOption[];
  initialValue?: EventItem;
  onBack: () => void;
  onClose: () => void;
}) {
  const isEdit = Boolean(initialValue);
  const router = useRouter();
  const [title, setTitle] = useState(initialValue?.title ?? "");
  const [eventDate, setEventDate] = useState(date);
  const [time, setTime] = useState(initialValue?.time ?? "");
  const [category, setCategory] = useState(initialValue?.category ?? "");
  const [description, setDescription] = useState(initialValue?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!eventDate) {
      setError("Pick a date.");
      return;
    }
    if (!category) {
      setError("Select a category.");
      return;
    }
    setIsSubmitting(true);

    const response = await fetch(isEdit ? `/api/events/${initialValue!.id}` : "/api/events", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, title, date: eventDate, time: time || undefined, category, description: description || undefined }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? `Failed to ${isEdit ? "save" : "add"} event.`);
      return;
    }

    onClose();
    toast.success("Calendar updated");
    router.refresh();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit event" : "New event"}</DialogTitle>
          <DialogDescription>{isEdit ? "Updates this company-wide event." : "Adds a company-wide event to the calendar."}</DialogDescription>
        </DialogHeader>
        <form id="event-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <RequiredFieldsHint />
          <FormField label="Title" htmlFor="event-title" required>
            <Input id="event-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Town hall meeting" required />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Date" htmlFor="event-date" required>
              <Input id="event-date" type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} required />
            </FormField>
            <FormField label="Time" htmlFor="event-time">
              <Input id="event-time" type="time" value={time} onChange={(event) => setTime(event.target.value)} />
            </FormField>
          </div>
          <OptionSelect label="Category" value={category} onChange={setCategory} options={categories} placeholder="Select a category" required />
          <FormField label="Description" htmlFor="event-description">
            <Textarea id="event-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="e.g. Bring your own laptop for the workshop" />
          </FormField>
          <FormError message={error} />
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onBack} disabled={isSubmitting} icon={ArrowLeft}>
            Back
          </Button>
          <Button type="submit" form="event-form" icon={isEdit ? Save : CalendarPlus} pending={isSubmitting} pendingLabel={isEdit ? "Saving…" : "Adding…"}>
            {isEdit ? "Save changes" : "Add event"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
