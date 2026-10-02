"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormError } from "@/components/shared/form-field";
import { HOLIDAY_TYPES, HOLIDAY_TYPE_LABELS, type HolidayType, type HolidayView } from "@/domains/holidays/holiday-types";

type Props = {
  organizationId: string;
  /** Edit this holiday; without it the form adds a new one. */
  holiday?: HolidayView;
  /** Adding from a day's panel: the date is fixed to that day. */
  date?: string;
  onSaved: () => void;
  onCancel?: () => void;
};

/**
 * Adds a holiday to the organization's calendar (a proclaimed day the preset
 * didn't have, a local one like a city's foundation day) or edits one: its
 * date, name, type, where it applies and its legal basis. Holidays loaded
 * from the Philippine list can be edited too, e.g. when a proclamation moves one.
 */
export function HolidayForm({ organizationId, holiday, date, onSaved, onCancel }: Props) {
  const editing = Boolean(holiday);
  const [day, setDay] = useState(holiday?.date ?? date ?? "");
  const [name, setName] = useState(holiday?.name ?? "");
  const [type, setType] = useState<HolidayType>(holiday?.type ?? "special_non_working");
  const [scope, setScope] = useState(holiday?.scope ?? "");
  const [source, setSource] = useState(holiday?.source ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const dateFixed = !editing && Boolean(date);
  const idPrefix = holiday ? `holiday-${holiday.id}` : "holiday-new";

  async function handleSave() {
    if (!day) return setError("Pick the date.");
    if (!name.trim()) return setError("Enter the holiday's name.");
    setError(null);
    setIsSaving(true);
    const body = {
      organizationId,
      date: day,
      name: name.trim(),
      type,
      ...(scope.trim() ? { scope: scope.trim() } : {}),
      ...(source.trim() ? { source: source.trim() } : {}),
    };
    const response = await fetch(holiday ? `/api/holidays/${holiday.id}` : "/api/holidays", {
      method: holiday ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setIsSaving(false);
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setError(result.error ?? (holiday ? "Failed to save the holiday." : "Failed to add the holiday."));
      return;
    }
    toast.success(holiday ? `Saved ${name.trim()}` : `Added ${name.trim()}`);
    if (!holiday) {
      setName("");
      setScope("");
      setSource("");
    }
    onSaved();
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3" data-testid={editing ? "edit-holiday-form" : "add-holiday-form"}>
      <div className="grid gap-3 sm:grid-cols-2">
        {!dateFixed && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${idPrefix}-date`}>Date</Label>
            <Input id={`${idPrefix}-date`} type="date" value={day} onChange={(event) => setDay(event.target.value)} />
          </div>
        )}
        <div className={dateFixed ? "flex flex-col gap-1.5 sm:col-span-2" : "flex flex-col gap-1.5"}>
          <Label htmlFor={`${idPrefix}-name`}>Name</Label>
          <Input id={`${idPrefix}-name`} placeholder="e.g. Cebu City Charter Day" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Type</Label>
          <Select value={type} onValueChange={(value) => value && setType(value as HolidayType)}>
            <SelectTrigger className="w-full" aria-label="Holiday type" data-testid="holiday-type-select">
              <SelectValue>{HOLIDAY_TYPE_LABELS[type]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {HOLIDAY_TYPES.map((option) => (
                <SelectItem key={option} value={option}>
                  {HOLIDAY_TYPE_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-scope`}>Applies to (optional)</Label>
          <Input id={`${idPrefix}-scope`} placeholder="Nationwide" value={scope} onChange={(event) => setScope(event.target.value)} maxLength={120} />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor={`${idPrefix}-source`}>Legal basis (optional)</Label>
          <Input id={`${idPrefix}-source`} placeholder="e.g. Proclamation No. 1006, s. 2025" value={source} onChange={(event) => setSource(event.target.value)} maxLength={160} />
        </div>
      </div>
      <FormError message={error} />
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={isSaving} icon={X}>
            Cancel
          </Button>
        )}
        <Button type="button" size="sm" onClick={handleSave} data-testid={editing ? "edit-holiday-submit" : "add-holiday-submit"} icon={Save} pending={isSaving} pendingLabel={editing ? "Saving…" : "Adding…"}>
          {editing ? "Save changes" : "Add holiday"}
        </Button>
      </div>
    </div>
  );
}

/** The add-only form, kept under its original name. */
export function AddHolidayForm(props: Omit<Props, "holiday">) {
  return <HolidayForm {...props} />;
}
