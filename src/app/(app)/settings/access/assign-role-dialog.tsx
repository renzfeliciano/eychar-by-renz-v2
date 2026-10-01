"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { UserPlus, Loader2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormError, RequiredFieldsHint } from "@/components/shared/form-field";
import { OptionSelect, type SelectOption } from "@/components/shared/option-select";
import { cn } from "@/lib/utils";

export function AssignRoleDialog({
  organizationId,
  members,
  roles,
}: {
  organizationId: string;
  members: SelectOption[];
  roles: SelectOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!userId || !roleId) {
      setError("Select a person and a role.");
      return;
    }
    setIsSubmitting(true);

    const response = await fetch("/api/role-assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, userId, roleId }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to assign role.");
      return;
    }

    setUserId("");
    setRoleId("");
    setOpen(false);
    toast.success("Role assigned");
    router.refresh();
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setUserId("");
      setRoleId("");
      setError(null);
    }
    setOpen(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger className={cn(buttonVariants({ size: "sm" }))} data-testid="assign-role-button">
        <UserPlus className="size-3.5" />
        Assign role
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign role</DialogTitle>
          <DialogDescription>Grants a person a role and its permissions, effective immediately.</DialogDescription>
        </DialogHeader>
        <form id="assign-role-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <RequiredFieldsHint />
          <OptionSelect label="Person" value={userId} onChange={setUserId} options={members} placeholder="Select a person" required />
          <OptionSelect label="Role" value={roleId} onChange={setRoleId} options={roles} placeholder="Select a role" required />
          <FormError message={error} />
        </form>
        <DialogFooter>
          <Button type="submit" form="assign-role-form" disabled={isSubmitting} data-testid="assign-role-submit-button">
            {isSubmitting && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
            {isSubmitting ? "Assigning…" : "Assign role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
