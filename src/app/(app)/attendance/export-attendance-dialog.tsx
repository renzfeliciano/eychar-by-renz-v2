"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { FormField, FormError } from "@/components/shared/form-field";
import { ExportDialog } from "@/components/shared/export-dialog";
import { attendanceExportQuerySchema } from "@/shared/validation/attendance";
import { cn } from "@/lib/utils";

type Range = { from: string; to: string };
type Preset = { id: string; label: string; range: Range };

function presetsFor(date: string): Preset[] {
  const [year, month] = date.split("-").map(Number);
  const monthKey = date.slice(0, 7);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthDate = new Date(Date.UTC(year, month - 1, 1));
  const shortMonth = monthDate.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const longMonth = monthDate.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  return [
    { id: "day", label: "Day shown", range: { from: date, to: date } },
    { id: "first-half", label: `${shortMonth} 1–15`, range: { from: `${monthKey}-01`, to: `${monthKey}-15` } },
    { id: "second-half", label: `${shortMonth} 16–${lastDay}`, range: { from: `${monthKey}-16`, to: `${monthKey}-${lastDay}` } },
    { id: "month", label: `All of ${longMonth}`, range: { from: `${monthKey}-01`, to: `${monthKey}-${lastDay}` } },
  ];
}

/**
 * Export the daily roster over a date range (ADR-028): the day on screen by
 * default, with one-click semi-monthly payroll cutoffs and the whole month.
 * The files are built server-side and downloaded from plain GET links.
 */
export function ExportAttendanceDialog({ organizationId, date }: { organizationId: string; date: string }) {
  const presets = presetsFor(date);
  const [range, setRange] = useState<Range>(presets[0].range);

  const activePreset = presets.find((preset) => preset.range.from === range.from && preset.range.to === range.to)?.id;
  const check = attendanceExportQuerySchema.safeParse({ organizationId, ...range, format: "xlsx" });
  const error = check.success ? null : (check.error.issues[0]?.message ?? "Choose a valid date range.");
  const href = (format: "xlsx" | "csv") => `/api/attendance/export?${new URLSearchParams({ organizationId, ...range, format })}`;

  return (
    <ExportDialog
      title="Export attendance"
      description="Everyone on the roster for each day in the range, with what was scheduled next to what was recorded. Up to 31 days."
      testIdPrefix="attendance-export"
      targets={{ xlsx: { href: href("xlsx") }, csv: { href: href("csv") } }}
      blocked={!check.success}
      onOpen={() => setRange(presets[0].range)}
    >
      <div role="radiogroup" aria-label="Date range" className="grid grid-cols-2 gap-1.5">
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            role="radio"
            aria-checked={activePreset === preset.id}
            onClick={() => setRange(preset.range)}
            className={cn(
              "rounded-lg border px-3 py-2 text-left text-sm font-medium transition-[color,background-color,border-color,scale] duration-150 ease-out active:scale-[0.97]",
              activePreset === preset.id ? "border-primary bg-primary/8 text-foreground" : "text-muted-foreground hover:border-ring/50 hover:text-foreground",
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="From" htmlFor="attendance-export-from">
          <Input id="attendance-export-from" type="date" value={range.from} onChange={(event) => setRange({ ...range, from: event.target.value })} />
        </FormField>
        <FormField label="To" htmlFor="attendance-export-to">
          <Input id="attendance-export-to" type="date" value={range.to} onChange={(event) => setRange({ ...range, to: event.target.value })} />
        </FormField>
      </div>

      <FormError message={error} />
    </ExportDialog>
  );
}
