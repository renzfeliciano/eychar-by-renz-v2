"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
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
import { FormField, FormError } from "@/components/shared/form-field";
import { cn } from "@/lib/utils";

export function AddApplicantDialog({ organizationId, jobOpeningId }: { organizationId: string; jobOpeningId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch("/api/applicants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, jobOpeningId, firstName, lastName, email: email || undefined, phone: phone || undefined }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to add applicant.");
      return;
    }

    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={cn(buttonVariants({ size: "sm" }))} data-testid="applicants-create-button">
        <Plus className="size-3.5" />
        Add applicant
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add applicant</DialogTitle>
        </DialogHeader>
        <form id="add-applicant-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="First name" htmlFor="applicant-first-name">
              <Input id="applicant-first-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} required />
            </FormField>
            <FormField label="Last name" htmlFor="applicant-last-name">
              <Input id="applicant-last-name" value={lastName} onChange={(event) => setLastName(event.target.value)} required />
            </FormField>
          </div>
          <FormField label="Email (optional)" htmlFor="applicant-email">
            <Input id="applicant-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </FormField>
          <FormField label="Phone (optional)" htmlFor="applicant-phone">
            <Input id="applicant-phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
          </FormField>
          <FormError message={error} />
        </form>
        <DialogFooter>
          <Button type="submit" form="add-applicant-form" disabled={isSubmitting} data-testid="applicants-create-submit-button">
            {isSubmitting ? "Adding…" : "Add applicant"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
