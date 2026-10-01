"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormError } from "@/components/shared/form-field";
import { HOLIDAY_TYPES, HOLIDAY_TYPE_LABELS, type HolidayType } from "@/domains/holidays/holiday-types";

/**
 * Adds one holiday to the organization's calendar: a proclaimed day the
 * preset didn't have, or a local one (a city's foundation day). With `date`
 * it's for that day only (the Schedules day panel); without, HR picks it.
 */
export function AddHolidayForm({ organizationId, date, onSaved, onCancel }: { organizationId: string; date?: string; onSaved: () => void; onCancel?: () => void }) {
  const [day, setDay] = useState(date ?? "");
  const [name, setName] = useState("");
  const [type, setType] = useState<HolidayType>("special_non_working");
  const [scope, setScope] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave() {
    if (!day) return setError("Pick the date.");
    if (!name.trim()) return setError("Enter the holiday's name.");
    setError(null);
    setIsSaving(true);
    const response = await fetch("/api/holidays", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, date: day, name: name.trim(), type, ...(scope.trim() ? { scope: scope.trim() } : {}) }),
    });
    setIsSaving(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to add the holiday.");
      return;
    }
    toast.success(`Added ${name.trim()}`);
    setName("");
    setScope("");
    onSaved();
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3" data-testid="add-holiday-form">
      <div className="grid gap-3 sm:grid-cols-2">
        {!date && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="holiday-date">Date</Label>
            <Input id="holiday-date" type="date" value={day} onChange={(event) => setDay(event.target.value)} />
          </div>
        )}
        <div className={date ? "flex flex-col gap-1.5 sm:col-span-2" : "flex flex-col gap-1.5"}>
          <Label htmlFor="holiday-name">Name</Label>
          <Input id="holiday-name" placeholder="e.g. Cebu City Charter Day" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} />
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
          <Label htmlFor="holiday-scope">Applies to (optional)</Label>
          <Input id="holiday-scope" placeholder="Nationwide" value={scope} onChange={(event) => setScope(event.target.value)} maxLength={120} />
        </div>
      </div>
      <FormError message={error} />
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
        )}
        <Button type="button" size="sm" onClick={handleSave} disabled={isSaving} data-testid="add-holiday-submit">
          {isSaving && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
          {isSaving ? "Adding…" : "Add holiday"}
        </Button>
      </div>
    </div>
  );
}
