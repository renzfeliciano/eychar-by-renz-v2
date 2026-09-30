"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Search, Users } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormError } from "@/components/shared/form-field";
import type { RosterMember } from "@/domains/attendance/schedule-service";
import { cn } from "@/lib/utils";

/**
 * Who appears on the monthly schedule. Some staff (office roles, for
 * example) aren't planned shift by shift, so HR can take them off here;
 * their past scheduled days are kept, just not shown.
 */
export function ScheduleRosterDialog({ organizationId, roster }: { organizationId: string; roster: RosterMember[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [included, setIncluded] = useState<Map<string, boolean>>(new Map());
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const isIncluded = (member: RosterMember) => included.get(member.employeeId) ?? member.included;
  const changes = roster.filter((member) => isIncluded(member) !== member.included).map((member) => ({ employeeId: member.employeeId, included: isIncluded(member) }));
  const includedCount = roster.filter(isIncluded).length;

  const normalizedQuery = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      normalizedQuery
        ? roster.filter((member) => member.name.toLowerCase().includes(normalizedQuery) || member.employeeNumber.toLowerCase().includes(normalizedQuery))
        : roster,
    [roster, normalizedQuery],
  );

  function setAll(value: boolean) {
    setIncluded((current) => {
      const next = new Map(current);
      for (const member of visible) next.set(member.employeeId, value);
      return next;
    });
  }

  async function handleSave() {
    setError(null);
    setIsSaving(true);
    const response = await fetch("/api/attendance/schedules/roster", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, changes }),
    });
    setIsSaving(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to update the schedule roster.");
      return;
    }
    toast.success(changes.length === 1 ? "Updated 1 employee" : `Updated ${changes.length} employees`);
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setIncluded(new Map());
          setQuery("");
          setError(null);
        }
        setOpen(next);
      }}
    >
      <DialogTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }))} data-testid="schedule-roster-button">
        <Users className="size-3.5" />
        Roster
      </DialogTrigger>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule roster</DialogTitle>
          <DialogDescription>Choose who is planned on the monthly schedule. People taken off keep their past scheduled days; they&apos;re just not shown.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input type="search" aria-label="Find employee" placeholder="Find by name or employee #" value={query} onChange={(event) => setQuery(event.target.value)} className="pl-8" />
          </div>
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="font-medium text-muted-foreground tabular-nums">
              {includedCount} of {roster.length} on the schedule
            </span>
            <span className="flex items-center gap-1">
              <Button type="button" size="xs" variant="ghost" onClick={() => setAll(true)} disabled={visible.length === 0}>
                Include all
              </Button>
              <Button type="button" size="xs" variant="ghost" onClick={() => setAll(false)} disabled={visible.length === 0}>
                Exclude all
              </Button>
            </span>
          </div>
        </div>

        <ul className="-mx-4 min-h-0 flex-1 divide-y overflow-y-auto border-y" data-testid="schedule-roster-list">
          {visible.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted-foreground">No one matches &ldquo;{query.trim()}&rdquo;.</li>}
          {visible.map((member) => {
            const checked = isIncluded(member);
            const inputId = `roster-${member.employeeId}`;
            return (
              <li key={member.employeeId}>
                <label htmlFor={inputId} className="flex items-center gap-3 px-4 py-2.5 transition-colors duration-150 hover:bg-muted/50">
                  <input
                    id={inputId}
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => setIncluded((current) => new Map(current).set(member.employeeId, event.target.checked))}
                    className="size-4 shrink-0 accent-primary"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{member.name}</span>
                    <span className="block text-xs text-muted-foreground tabular-nums">{member.employeeNumber || "No employee #"}</span>
                  </span>
                  {!checked && <span className="text-xs text-muted-foreground">Not scheduled</span>}
                </label>
              </li>
            );
          })}
        </ul>

        <FormError message={error} />
        <DialogFooter>
          <Button onClick={handleSave} disabled={isSaving || changes.length === 0} data-testid="schedule-roster-save-button">
            {isSaving && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
            {isSaving ? "Saving…" : changes.length ? `Save ${changes.length === 1 ? "1 change" : `${changes.length} changes`}` : "No changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
