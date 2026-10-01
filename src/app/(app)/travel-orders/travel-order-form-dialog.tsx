"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Plane } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormField, FormError, RequiredFieldsHint } from "@/components/shared/form-field";
import { cn } from "@/lib/utils";

export type EmployeeOption = { id: string; label: string };

export type TravelOrderFormValue = {
  id: string;
  employeeIds: string[];
  startDate: string;
  endDate: string;
  remarks?: string | null;
};

function toDateInputValue(value: string): string {
  return value ? value.slice(0, 10) : "";
}

export function TravelOrderFormDialog({
  organizationId,
  employees,
  initialValue,
}: {
  organizationId: string;
  employees: EmployeeOption[];
  initialValue?: TravelOrderFormValue;
}) {
  const isEdit = Boolean(initialValue);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [employeeIds, setEmployeeIds] = useState<string[]>(initialValue?.employeeIds ?? []);
  const [startDate, setStartDate] = useState(toDateInputValue(initialValue?.startDate ?? ""));
  const [endDate, setEndDate] = useState(toDateInputValue(initialValue?.endDate ?? ""));
  const [remarks, setRemarks] = useState(initialValue?.remarks ?? "");
  const [employeesError, setEmployeesError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function toggleEmployee(id: string, checked: boolean) {
    setEmployeeIds((current) => (checked ? [...current, id] : current.filter((existing) => existing !== id)));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (employeeIds.length === 0) {
      setEmployeesError("Select at least one employee.");
      return;
    }
    setEmployeesError(null);
    setIsSubmitting(true);

    const response = await fetch(isEdit ? `/api/travel-orders/${initialValue!.id}` : "/api/travel-orders", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, employeeIds, startDate, endDate, remarks: remarks || undefined }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? `Failed to ${isEdit ? "save" : "create"} travel order.`);
      return;
    }

    if (!isEdit) {
      setEmployeeIds([]);
      setStartDate("");
      setEndDate("");
      setRemarks("");
    }
    setOpen(false);
    router.refresh();
  }

  const formId = `travel-order-form-${initialValue?.id ?? "new"}`;

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setEmployeeIds(initialValue?.employeeIds ?? []);
      setStartDate(toDateInputValue(initialValue?.startDate ?? ""));
      setEndDate(toDateInputValue(initialValue?.endDate ?? ""));
      setRemarks(initialValue?.remarks ?? "");
      setEmployeesError(null);
      setError(null);
    }
    setOpen(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        className={cn(isEdit ? buttonVariants({ size: "sm", variant: "ghost" }) : buttonVariants({ size: "sm" }))}
        aria-label={isEdit ? "Edit travel order" : undefined}
        data-testid={isEdit ? "travel-order-edit-button" : "travel-orders-create-button"}
      >
        {isEdit ? (
          <Pencil className="size-3.5" />
        ) : (
          <>
            <Plus className="size-3.5" />
            New travel order
          </>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit travel order" : "New travel order"}</DialogTitle>
          <DialogDescription>{isEdit ? "Updates this travel order's details." : "Dispatches one or more employees for a date range."}</DialogDescription>
        </DialogHeader>
        <form id={formId} onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <RequiredFieldsHint />
          <FormField label="Employees" htmlFor={`${formId}-employees`} required>
            <div id={`${formId}-employees`} className="flex max-h-40 flex-col gap-2 overflow-y-auto rounded-lg border p-2">
              {employees.length === 0 ? (
                <p className="p-2 text-sm text-muted-foreground">No employees yet.</p>
              ) : (
                employees.map((employee) => (
                  <label key={employee.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/40">
                    <Checkbox
                      checked={employeeIds.includes(employee.id)}
                      onCheckedChange={(checked) => toggleEmployee(employee.id, checked === true)}
                    />
                    {employee.label}
                  </label>
                ))
              )}
            </div>
          </FormField>
          <FormError message={employeesError} />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Start date" htmlFor={`${formId}-start`} required>
              <Input id={`${formId}-start`} type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required />
            </FormField>
            <FormField label="End date" htmlFor={`${formId}-end`} required>
              <Input id={`${formId}-end`} type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} min={startDate || undefined} required />
            </FormField>
          </div>
          <FormField label="Remarks" htmlFor={`${formId}-remarks`}>
            <Textarea id={`${formId}-remarks`} value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder="e.g. Year-end audit — Cebu branch" />
          </FormField>
          <FormError message={error} />
        </form>
        <DialogFooter>
          <Button type="submit" form={formId} disabled={isSubmitting} data-testid={isEdit ? "travel-order-save-button" : "travel-orders-create-submit-button"}>
            {isEdit ? (
              isSubmitting ? "Saving…" : "Save changes"
            ) : (
              <>
                <Plane className="size-3.5" />
                {isSubmitting ? "Creating…" : "Create travel order"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
