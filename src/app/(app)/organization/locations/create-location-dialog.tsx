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
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormField, FormError, RequiredFieldsHint } from "@/components/shared/form-field";
import { cn } from "@/lib/utils";

export function CreateLocationDialog({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch("/api/locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, name, code, address: address || undefined }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to create location.");
      return;
    }

    setName("");
    setCode("");
    setAddress("");
    setOpen(false);
    router.refresh();
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setName("");
      setCode("");
      setAddress("");
      setError(null);
    }
    setOpen(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger className={cn(buttonVariants({ size: "sm" }))} data-testid="locations-create-button">
        <Plus className="size-3.5" />
        Add location
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add location</DialogTitle>
          <DialogDescription>Adds a physical site or branch employees can be assigned to.</DialogDescription>
        </DialogHeader>
        <form id="create-location-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <RequiredFieldsHint />
          <FormField label="Name" htmlFor="location-name" required>
            <Input id="location-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. PCAS Head Office" required />
          </FormField>
          <FormField label="Code" htmlFor="location-code" required>
            <Input id="location-code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="e.g. HO" required />
          </FormField>
          <FormField label="Address" htmlFor="location-address">
            <Input id="location-address" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="e.g. 123 Rizal Street, Brgy. San Isidro, Quezon City" />
          </FormField>
          <FormError message={error} />
        </form>
        <DialogFooter>
          <Button type="submit" form="create-location-form" disabled={isSubmitting} data-testid="locations-create-submit-button">
            {isSubmitting ? "Adding…" : "Add location"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
