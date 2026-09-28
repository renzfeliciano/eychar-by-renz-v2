"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus, Loader2, Pencil } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormError, FormField, RequiredFieldsHint } from "@/components/shared/form-field";
import { OptionSelect, type SelectOption } from "@/components/shared/option-select";
import { describeCutoffs, WEEKDAY_NAMES } from "@/domains/payroll/payroll-labels";
import { periodContaining, nextPeriod } from "@/domains/payroll/engine/pay-periods";
import type { PayFrequency } from "@/domains/payroll/engine/pay-frequency";
import { formatDateKey, formatDateRange, localDateKey } from "@/lib/date-key";
import { cn } from "@/lib/utils";

export type ScheduleDraft = {
  id?: string;
  name: string;
  projectId: string;
  payFrequency: PayFrequency;
  cutoffDay: number;
  payDateOffsetDays: number;
  autoPrepare: boolean;
  status?: "active" | "inactive";
};

const NEW_SCHEDULE: ScheduleDraft = { name: "", projectId: "", payFrequency: "semi-monthly", cutoffDay: 15, payDateOffsetDays: 5, autoPrepare: true };

const FREQUENCIES: SelectOption[] = [
  { id: "semi-monthly", label: "Semi-monthly" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
];

const SEMI_MONTHLY_PATTERNS: SelectOption[] = [
  { id: "15", label: "1st–15th and 16th–end of month" },
  { id: "10", label: "26th–10th and 11th–25th" },
  { id: "5", label: "21st–5th and 6th–20th" },
];

function defaultCutoffDay(frequency: PayFrequency): number {
  return frequency === "weekly" ? 6 : frequency === "monthly" ? 31 : 15;
}

/** Create or edit a payroll calendar, with a live preview of its next two cutoffs. */
export function ScheduleDialog({ organizationId, projects, schedule }: { organizationId: string; projects: SelectOption[]; schedule?: ScheduleDraft }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ScheduleDraft>(schedule ?? NEW_SCHEDULE);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isEdit = Boolean(schedule?.id);

  const spec = { payFrequency: draft.payFrequency, cutoffDay: draft.cutoffDay, payDateOffsetDays: draft.payDateOffsetDays };
  const current = periodContaining(spec, localDateKey());
  const upcoming = [current, nextPeriod(spec, current)];

  async function save() {
    setError(null);
    if (!draft.name.trim()) return setError("Give the schedule a name.");
    setSaving(true);
    const payload = {
      organizationId,
      name: draft.name.trim(),
      projectId: draft.projectId || (isEdit ? "" : undefined),
      payFrequency: draft.payFrequency,
      cutoffDay: draft.cutoffDay,
      payDateOffsetDays: draft.payDateOffsetDays,
      autoPrepare: draft.autoPrepare,
      ...(isEdit ? { status: draft.status } : { startsOn: localDateKey() }),
    };
    const response = await fetch(isEdit ? `/api/payroll-schedules/${schedule!.id}` : "/api/payroll-schedules", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) return setError(body.error ?? "Couldn't save the schedule.");
    toast.success(isEdit ? "Schedule updated" : "Schedule created");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setDraft(schedule ?? NEW_SCHEDULE);
          setError(null);
        }
        setOpen(next);
      }}
    >
      <DialogTrigger
        className={cn(buttonVariants(isEdit ? { variant: "ghost", size: "icon-sm" } : { size: "sm" }))}
        aria-label={isEdit ? `Edit ${schedule!.name}` : undefined}
        data-testid={isEdit ? "payroll-schedule-edit" : "payroll-schedule-create"}
      >
        {isEdit ? <Pencil className="size-3.5" /> : <CalendarPlus className="size-3.5" />}
        {!isEdit && "New schedule"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit payroll schedule" : "New payroll schedule"}</DialogTitle>
          <DialogDescription>The day after each cutoff, a draft run is prepared for HR to review. Nothing is submitted or approved automatically.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <RequiredFieldsHint />
          <FormField label="Name" htmlFor="schedule-name" required>
            <Input id="schedule-name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="e.g. EGI Rufino site payroll" />
          </FormField>
          <OptionSelect label="Who's paid" value={draft.projectId} onChange={(projectId) => setDraft({ ...draft, projectId })} options={projects} placeholder="Everyone (all projects)" />
          <div className="grid gap-3 sm:grid-cols-2">
            <OptionSelect
              label="Pay frequency"
              value={draft.payFrequency}
              onChange={(value) => {
                const payFrequency = (value || "semi-monthly") as PayFrequency;
                setDraft({ ...draft, payFrequency, cutoffDay: defaultCutoffDay(payFrequency) });
              }}
              options={FREQUENCIES}
              placeholder="Semi-monthly"
              required
            />
            {draft.payFrequency === "semi-monthly" && (
              <OptionSelect
                label="Cutoffs"
                value={String(draft.cutoffDay)}
                onChange={(value) => setDraft({ ...draft, cutoffDay: Number(value || 15) })}
                options={SEMI_MONTHLY_PATTERNS.some((option) => option.id === String(draft.cutoffDay)) ? SEMI_MONTHLY_PATTERNS : [...SEMI_MONTHLY_PATTERNS, { id: String(draft.cutoffDay), label: describeCutoffs("semi-monthly", draft.cutoffDay) }]}
                placeholder="1st–15th and 16th–end"
                required
              />
            )}
            {draft.payFrequency === "weekly" && (
              <OptionSelect
                label="Week ends on"
                value={String(draft.cutoffDay)}
                onChange={(value) => setDraft({ ...draft, cutoffDay: Number(value || 6) })}
                options={WEEKDAY_NAMES.map((name, index) => ({ id: String(index), label: name }))}
                placeholder="Saturday"
                required
              />
            )}
            {draft.payFrequency === "monthly" && (
              <FormField label="Period ends on day" htmlFor="schedule-cutoff-day" required>
                <Input
                  id="schedule-cutoff-day"
                  type="number"
                  min={1}
                  max={31}
                  value={draft.cutoffDay}
                  onChange={(event) => setDraft({ ...draft, cutoffDay: Math.min(31, Math.max(1, Number(event.target.value) || 1)) })}
                  placeholder="e.g. 31 for month end"
                />
              </FormField>
            )}
          </div>
          <FormField label="Pay day, days after the cutoff" htmlFor="schedule-offset" required>
            <Input
              id="schedule-offset"
              type="number"
              min={0}
              max={31}
              value={draft.payDateOffsetDays}
              onChange={(event) => setDraft({ ...draft, payDateOffsetDays: Math.min(31, Math.max(0, Number(event.target.value) || 0)) })}
              className="sm:w-32"
              placeholder="e.g. 5"
            />
          </FormField>

          <div className="rounded-lg border bg-muted/30 px-3 py-2.5 text-sm">
            <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Next cutoffs</p>
            {upcoming.map((period) => (
              <p key={period.end} className="flex justify-between gap-3 tabular-nums">
                <span>{formatDateRange(period.start, period.end)}</span>
                <span className="text-muted-foreground">pay {formatDateKey(period.payDate, { month: "short", day: "numeric" })}</span>
              </p>
            ))}
          </div>

          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={draft.autoPrepare} onCheckedChange={(checked) => setDraft({ ...draft, autoPrepare: checked === true })} className="mt-0.5" />
            <span>
              Prepare draft runs automatically
              <span className="block text-xs text-muted-foreground">Off: the schedule only suggests periods when someone prepares a run.</span>
            </span>
          </label>
          {isEdit && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={draft.status === "inactive"} onCheckedChange={(checked) => setDraft({ ...draft, status: checked === true ? "inactive" : "active" })} />
              Retire this schedule
            </label>
          )}
          <FormError message={error} />
        </div>

        <DialogFooter>
          <Button onClick={save} disabled={saving} data-testid="payroll-schedule-save">
            {saving && <Loader2 className="size-3.5 animate-spin" />}
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
