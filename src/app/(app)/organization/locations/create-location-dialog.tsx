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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={cn(buttonVariants({ size: "sm" }))} data-testid="locations-create-button">
        <Plus className="size-3.5" />
        Add location
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add location</DialogTitle>
        </DialogHeader>
        <form id="create-location-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FormField label="Name" htmlFor="location-name">
            <Input id="location-name" value={name} onChange={(event) => setName(event.target.value)} required />
          </FormField>
          <FormField label="Code" htmlFor="location-code">
            <Input id="location-code" value={code} onChange={(event) => setCode(event.target.value)} required />
          </FormField>
          <FormField label="Address" htmlFor="location-address">
            <Input id="location-address" value={address} onChange={(event) => setAddress(event.target.value)} />
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
