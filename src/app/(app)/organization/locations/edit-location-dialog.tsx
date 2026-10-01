"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Loader2, Pencil } from "lucide-react";
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
import { SiteCoordinatesFields, type SiteCoordinates } from "./site-coordinates-fields";

export type EditableLocation = {
  id: string;
  name: string;
  code: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  geofenceRadiusMeters: number | null;
};

function toSiteCoordinates(location: EditableLocation): SiteCoordinates {
  return {
    latitude: location.latitude?.toString() ?? "",
    longitude: location.longitude?.toString() ?? "",
    radius: (location.geofenceRadiusMeters ?? 100).toString(),
  };
}

export function EditLocationDialog({ organizationId, location }: { organizationId: string; location: EditableLocation }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(location.name);
  const [code, setCode] = useState(location.code);
  const [address, setAddress] = useState(location.address ?? "");
  const [site, setSite] = useState<SiteCoordinates>(toSiteCoordinates(location));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    // Every field is sent pre-filled; "" tells the server to clear it.
    const response = await fetch(`/api/locations/${location.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId,
        name,
        code,
        address: address.trim(),
        latitude: site.latitude.trim(),
        longitude: site.longitude.trim(),
        geofenceRadiusMeters: site.radius.trim() || undefined,
      }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to update location.");
      return;
    }

    setOpen(false);
    toast.success("Location updated");
    router.refresh();
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setName(location.name);
      setCode(location.code);
      setAddress(location.address ?? "");
      setSite(toSiteCoordinates(location));
      setError(null);
    }
    setOpen(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
        aria-label={`Edit ${location.name}`}
        data-testid={`locations-edit-button-${location.id}`}
      >
        <Pencil className="size-3.5" />
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit location</DialogTitle>
          <DialogDescription>Update the site&apos;s details and clock-in area. Projects and records linked to it stay linked.</DialogDescription>
        </DialogHeader>
        <form id={`edit-location-form-${location.id}`} onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <RequiredFieldsHint />
          <FormField label="Name" htmlFor={`location-edit-name-${location.id}`} required>
            <Input id={`location-edit-name-${location.id}`} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. PCAS Head Office" required />
          </FormField>
          <FormField label="Code" htmlFor={`location-edit-code-${location.id}`} required>
            <Input
              id={`location-edit-code-${location.id}`}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="e.g. HO"
              autoCapitalize="characters"
              spellCheck={false}
              required
              data-testid="locations-edit-code-input"
            />
          </FormField>
          <FormField label="Address" htmlFor={`location-edit-address-${location.id}`}>
            <Input
              id={`location-edit-address-${location.id}`}
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="e.g. 123 Rizal Street, Brgy. San Isidro, Quezon City"
            />
          </FormField>
          <SiteCoordinatesFields idPrefix={`location-edit-${location.id}`} value={site} onChange={setSite} />
          <FormError message={error} />
        </form>
        <DialogFooter>
          <Button type="submit" form={`edit-location-form-${location.id}`} disabled={isSubmitting} data-testid="locations-edit-submit-button">
            {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {isSubmitting ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
