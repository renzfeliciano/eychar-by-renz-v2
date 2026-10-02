"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { KeyRound, Plus } from "lucide-react";
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
import { cn } from "@/lib/utils";

/** API field → the control it's about, for field-level errors (see useFieldErrors). */
const EMPLOYEE_ACCOUNT_FIELD_IDS = {
  username: "employee-account-username",
  password: "employee-account-password",
} as const;

export function CreateEmployeeAccountDialog({ organizationId, employeeId, suggestedUsername }: { organizationId: string; employeeId: string; suggestedUsername?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState(suggestedUsername ?? "");
  const [password, setPassword] = useState("");
  const { fieldErrors, formError: error, setFormError: setError, setFromResponse } = useFieldErrors({ fieldIds: EMPLOYEE_ACCOUNT_FIELD_IDS });
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch("/api/employee-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, employeeId, username, password }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setFromResponse(body, "Failed to create self-service login.");
      return;
    }

    setOpen(false);
    toast.success("Self-service login created");
    router.refresh();
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setUsername(suggestedUsername ?? "");
      setPassword("");
      setError(null);
    }
    setOpen(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger className={cn(buttonVariants({ size: "sm", variant: "outline" }))} data-testid="create-employee-account-button">
        <KeyRound className="size-3.5" />
        Create self-service login
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create self-service login</DialogTitle>
          <DialogDescription>Sets up this employee&apos;s account for clocking in/out and viewing their own records.</DialogDescription>
        </DialogHeader>
        <form id="create-employee-account-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <RequiredFieldsHint />
          <p className="text-sm text-muted-foreground">
            Lets this employee sign in on their own device to clock in/out with biometric confirmation and location.
          </p>
          <FormField label="Username" htmlFor="employee-account-username" error={fieldErrors.username} required>
            <Input id="employee-account-username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="e.g. jdelacruz" required />
          </FormField>
          <FormField label="Temporary password" htmlFor="employee-account-password" error={fieldErrors.password} required>
            <Input
              id="employee-account-password"
              type="text"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 12 characters, e.g. harbor-lantern-73"
              required
            />
          </FormField>
          <FormError message={error} />
        </form>
        <DialogFooter>
          <Button type="submit" form="create-employee-account-form" data-testid="create-employee-account-submit-button" icon={Plus} pending={isSubmitting} pendingLabel="Creating…">
            Create login
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
