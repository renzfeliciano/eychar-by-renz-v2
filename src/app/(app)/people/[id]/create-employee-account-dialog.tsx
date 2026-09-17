"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
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
import { cn } from "@/lib/utils";

export function CreateEmployeeAccountDialog({ organizationId, employeeId, suggestedUsername }: { organizationId: string; employeeId: string; suggestedUsername: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState(suggestedUsername);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
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
      setError(body.error ?? "Failed to create self-service login.");
      return;
    }

    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={cn(buttonVariants({ size: "sm", variant: "outline" }))} data-testid="create-employee-account-button">
        <KeyRound className="size-3.5" />
        Create self-service login
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create self-service login</DialogTitle>
        </DialogHeader>
        <form id="create-employee-account-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
          <RequiredFieldsHint />
          <p className="text-sm text-muted-foreground">
            Lets this employee sign in on their own device to clock in/out with biometric confirmation and location.
          </p>
          <FormField label="Username" htmlFor="employee-account-username" required>
            <Input id="employee-account-username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="e.g. jdelacruz" required />
          </FormField>
          <FormField label="Temporary password" htmlFor="employee-account-password" required>
            <Input
              id="employee-account-password"
              type="text"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="e.g. a random 8+ character password"
              required
            />
          </FormField>
          <FormError message={error} />
        </form>
        <DialogFooter>
          <Button type="submit" form="create-employee-account-form" disabled={isSubmitting} data-testid="create-employee-account-submit-button">
            {isSubmitting ? "Creating…" : "Create login"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
