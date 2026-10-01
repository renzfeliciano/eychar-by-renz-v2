"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Ban, ListChecks, Loader2, RotateCcw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormField, FormError, RequiredFieldsHint } from "@/components/shared/form-field";
import { OptionSelect, type SelectOption } from "@/components/shared/option-select";
import { StatusBadge } from "@/components/shared/status-badge";
import { AUTO_SOURCE_LABELS, CLEARANCE_AUTO_SOURCES } from "@/domains/clearance/clearance-sources";
import { cn } from "@/lib/utils";

const AUTO_OPTIONS = CLEARANCE_AUTO_SOURCES.map((source) => ({ id: source, label: AUTO_SOURCE_LABELS[source] }));

export type ChecklistRow = { id: string; departmentCode: string; title: string; blocking: boolean; dueDaysAfterLastDay: number; status: string; autoSource?: string | null };

/**
 * The organization's clearance checklist. New clearances copy the active
 * items; editing here never changes a clearance already open.
 */
export function ChecklistDialog({ organizationId, departments, items }: { organizationId: string; departments: SelectOption[]; items: ChecklistRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [departmentCode, setDepartmentCode] = useState("");
  const [title, setTitle] = useState("");
  const [blocking, setBlocking] = useState(true);
  const [dueDays, setDueDays] = useState("0");
  const [autoSource, setAutoSource] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const departmentName = new Map(departments.map((department) => [department.id, department.label]));
  const grouped = departments
    .map((department) => ({ ...department, rows: items.filter((item) => item.departmentCode === department.id) }))
    .filter((group) => group.rows.length > 0);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!departmentCode || !title.trim()) {
      setError("Choose a department and describe what must be cleared.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    const response = await fetch("/api/clearance/checklist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, departmentCode, title: title.trim(), blocking, dueDaysAfterLastDay: Number(dueDays) || 0, autoSource: autoSource || undefined }),
    });
    setIsSubmitting(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to add the item.");
      return;
    }
    setTitle("");
    setAutoSource("");
    toast.success("Checklist updated");
    router.refresh();
  }

  async function toggle(item: ChecklistRow) {
    setTogglingId(item.id);
    const response = await fetch(`/api/clearance/checklist/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, status: item.status === "active" ? "inactive" : "active" }),
    });
    setTogglingId(null);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to update the item.");
      return;
    }
    toast.success("Checklist updated");
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setError(null);
        setOpen(next);
      }}
    >
      <DialogTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }))} data-testid="clearance-checklist-button">
        <ListChecks className="size-3.5" />
        Checklist
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Clearance checklist</DialogTitle>
          <DialogDescription>What each department clears when someone leaves. New clearances copy the active items; open ones keep theirs.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 rounded-lg border p-3">
          <RequiredFieldsHint />
          <div className="grid gap-3 sm:grid-cols-[11rem_1fr]">
            <OptionSelect label="Department" value={departmentCode} onChange={setDepartmentCode} options={departments} placeholder="Select a department" testId="checklist-department-select" required />
            <FormField label="Item" htmlFor="checklist-title" required>
              <Input id="checklist-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Return company laptop and charger" maxLength={120} required />
            </FormField>
          </div>
          <OptionSelect label="Automatic check" value={autoSource} onChange={setAutoSource} options={AUTO_OPTIONS} placeholder="None (signed off by hand)" testId="checklist-auto-select" />
          <div className="flex flex-wrap items-end gap-4">
            <FormField label="Due (days after last day)" htmlFor="checklist-due">
              <Input id="checklist-due" type="number" min={0} max={60} value={dueDays} onChange={(event) => setDueDays(event.target.value)} placeholder="e.g. 0" className="w-28" />
            </FormField>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input type="checkbox" checked={blocking} onChange={(event) => setBlocking(event.target.checked)} className="size-4 accent-primary" />
              Must be resolved before final pay
            </label>
            <Button type="submit" size="sm" className="ml-auto" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
              {isSubmitting ? "Adding…" : "Add item"}
            </Button>
          </div>
          <FormError message={error} />
        </form>

        {grouped.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No checklist items yet. Add what each department needs to clear.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {grouped.map((group) => (
              <section key={group.id} aria-label={group.label}>
                <h3 className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">{departmentName.get(group.id)}</h3>
                <ul className="divide-y rounded-lg border">
                  {group.rows.map((item) => (
                    <li key={item.id} className={cn("flex items-center gap-3 px-3 py-2", item.status !== "active" && "opacity-60")}>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.autoSource ? `${AUTO_SOURCE_LABELS[item.autoSource as keyof typeof AUTO_SOURCE_LABELS] ?? item.autoSource} · ` : ""}
                          {item.blocking ? "Blocks final pay" : "Doesn't block final pay"} · due {item.dueDaysAfterLastDay === 0 ? "on the last day" : `${item.dueDaysAfterLastDay} day${item.dueDaysAfterLastDay === 1 ? "" : "s"} after`}
                        </p>
                      </div>
                      {item.status !== "active" && <StatusBadge status={item.status} />}
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        disabled={togglingId === item.id}
                        onClick={() => toggle(item)}
                        aria-label={item.status === "active" ? `Retire ${item.title}` : `Restore ${item.title}`}
                      >
                        {togglingId === item.id ? <Loader2 className="size-3.5 animate-spin" /> : item.status === "active" ? <Ban className="size-3.5" /> : <RotateCcw className="size-3.5" />}
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
