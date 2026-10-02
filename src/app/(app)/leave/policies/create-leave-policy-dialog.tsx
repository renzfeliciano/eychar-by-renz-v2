"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useFieldErrors } from "@/lib/field-errors";
import { OptionSelect, type SelectOption } from "@/components/shared/option-select";
import { cn } from "@/lib/utils";

/** API field → the control it's about, for field-level errors (see useFieldErrors). */
const LEAVE_POLICY_FIELD_IDS = {
  name: "leave-policy-name",
  annualEntitlementDays: "leave-policy-days",
  leaveTypeId: "leave-policy-leave-type",
  projectId: "leave-policy-project",
} as const;

export function CreateLeavePolicyDialog({
  organizationId,
  leaveTypes,
  projects,
}: {
  organizationId: string;
  leaveTypes: SelectOption[];
  projects: SelectOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [annualEntitlementDays, setAnnualEntitlementDays] = useState("15");
  const { fieldErrors, formError: error, setFormError: setError, setFromResponse } = useFieldErrors({ fieldIds: LEAVE_POLICY_FIELD_IDS });
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!leaveTypeId) {
      setError("Select a leave type.");
      return;
    }
    setIsSubmitting(true);

    const response = await fetch("/api/leave-policies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId,
        leaveTypeId,
        name,
        projectId: projectId || undefined,
        annualEntitlementDays: Number(annualEntitlementDays),
      }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setFromResponse(body, "Failed to create leave policy.");
      return;
    }

    setName("");
    setProjectId("");
    setOpen(false);
    toast.success("Leave policy saved");
    router.refresh();
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setName("");
      setLeaveTypeId("");
      setProjectId("");
      setAnnualEntitlementDays("15");
      setError(null);
    }
    setOpen(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger className={cn(buttonVariants({ size: "sm" }))} data-testid="leave-policies-create-button">
        <Plus className="size-3.5" />
        Add policy
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add leave policy</DialogTitle>
          <DialogDescription>Defines accrual rules and eligibility for a leave type.</DialogDescription>
        </DialogHeader>
        <form id="create-leave-policy-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <RequiredFieldsHint />
          <FormField label="Name" htmlFor="leave-policy-name" error={fieldErrors.name} required>
            <Input id="leave-policy-name" placeholder="e.g. Standard Vacation Leave Policy" value={name} onChange={(event) => setName(event.target.value)} required />
          </FormField>
          <OptionSelect id="leave-policy-leave-type" error={fieldErrors.leaveTypeId} label="Leave type" value={leaveTypeId} onChange={setLeaveTypeId} options={leaveTypes} placeholder="Select a leave type" required />
          <OptionSelect id="leave-policy-project" error={fieldErrors.projectId} label="Project" value={projectId} onChange={setProjectId} options={projects} placeholder="Org-wide" />
          <FormField label="Annual entitlement (days)" htmlFor="leave-policy-days" error={fieldErrors.annualEntitlementDays} required>
            <Input
              id="leave-policy-days"
              type="number"
              min={0}
              placeholder="e.g. 15"
              value={annualEntitlementDays}
              onChange={(event) => setAnnualEntitlementDays(event.target.value)}
              required
            />
          </FormField>
          <FormError message={error} />
        </form>
        <DialogFooter>
          <Button type="submit" form="create-leave-policy-form" data-testid="leave-policies-create-submit-button" icon={Plus} pending={isSubmitting} pendingLabel="Adding…">
            Add policy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
