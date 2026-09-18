"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormField, FormError, RequiredFieldsHint } from "@/components/shared/form-field";
import { OptionSelect, type SelectOption } from "@/components/shared/option-select";
import { cn } from "@/lib/utils";

export function CreateStaffAccountDialog({ organizationId, roles }: { organizationId: string; roles: SelectOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch("/api/staff-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, firstName, lastName, username, password, roleId: roleId || undefined }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to create staff account.");
      return;
    }

    setFirstName("");
    setLastName("");
    setUsername("");
    setPassword("");
    setRoleId("");
    setOpen(false);
    router.refresh();
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setFirstName("");
      setLastName("");
      setUsername("");
      setPassword("");
      setRoleId("");
      setError(null);
    }
    setOpen(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger className={cn(buttonVariants({ size: "sm" }))} data-testid="staff-accounts-create-button">
        <UserPlus className="size-3.5" />
        Add staff account
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add staff account</DialogTitle>
        </DialogHeader>
        <form id="create-staff-account-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <RequiredFieldsHint />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="First name" htmlFor="staff-first-name" required>
              <Input id="staff-first-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder="e.g. Bea" required />
            </FormField>
            <FormField label="Last name" htmlFor="staff-last-name" required>
              <Input id="staff-last-name" value={lastName} onChange={(event) => setLastName(event.target.value)} placeholder="e.g. Cruz" required />
            </FormField>
          </div>
          <FormField label="Username" htmlFor="staff-username" required>
            <Input id="staff-username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="e.g. bea.cruz" required />
          </FormField>
          <FormField label="Temporary password" htmlFor="staff-password" required>
            <Input id="staff-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" required />
          </FormField>
          <OptionSelect label="Role" value={roleId} onChange={setRoleId} options={roles} placeholder="Assign later" />
          <FormError message={error} />
        </form>
        <DialogFooter>
          <Button type="submit" form="create-staff-account-form" disabled={isSubmitting} data-testid="staff-accounts-create-submit-button">
            {isSubmitting ? "Adding…" : "Add staff account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
