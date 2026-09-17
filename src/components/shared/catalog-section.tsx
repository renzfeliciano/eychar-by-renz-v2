"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Ban, RotateCcw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormField, FormError } from "@/components/shared/form-field";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";

export type CatalogItemRow = {
  _id: string;
  code: string;
  name: string;
  description?: string | null;
  status: string;
};

/**
 * One reusable "Add item" modal + table, rendered once per catalogType on
 * the Settings > Catalogs page — the generic admin surface for every
 * org-managed lookup list (employment status/type, attendance status,
 * recruitment stage, event category, case classification/status) instead
 * of seven bespoke pages.
 */
export function CatalogSection({
  organizationId,
  catalogType,
  title,
  description,
  items,
  canCreate,
  canUpdate,
}: {
  organizationId: string;
  catalogType: string;
  title: string;
  description: string;
  items: CatalogItemRow[];
  canCreate: boolean;
  canUpdate: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch(`/api/catalogs/${catalogType}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, name, description: itemDescription || undefined }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to add item.");
      return;
    }

    setName("");
    setItemDescription("");
    setOpen(false);
    router.refresh();
  }

  async function handleToggleStatus(id: string, nextStatus: "active" | "inactive") {
    setTogglingId(id);
    await fetch(`/api/catalogs/${catalogType}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, status: nextStatus }),
    });
    setTogglingId(null);
    router.refresh();
  }

  const formId = `catalog-form-${catalogType}`;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {canCreate && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger className={cn(buttonVariants({ size: "sm" }))} data-testid={`catalog-${catalogType}-add-button`}>
              <Plus className="size-3.5" />
              Add
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add {title.toLowerCase()} item</DialogTitle>
              </DialogHeader>
              <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-4">
                <FormField label="Name" htmlFor={`${formId}-name`}>
                  <Input id={`${formId}-name`} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Regular" required />
                </FormField>
                <FormField label="Description (optional)" htmlFor={`${formId}-description`}>
                  <Input id={`${formId}-description`} value={itemDescription} onChange={(event) => setItemDescription(event.target.value)} placeholder="e.g. Standard, full-time employment" />
                </FormField>
                <FormError message={error} />
              </form>
              <DialogFooter>
                <Button type="submit" form={formId} disabled={isSubmitting} data-testid={`catalog-${catalogType}-add-submit-button`}>
                  {isSubmitting ? "Adding…" : "Add"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        <DataTable
          caption={title}
          testId={`catalog-${catalogType}-table`}
          columns={[
            { key: "name", header: "Name", render: (item) => <span className="font-medium">{item.name}</span> },
            { key: "description", header: "Description", render: (item) => item.description ?? "—" },
            { key: "status", header: "Status", render: (item) => <StatusBadge status={item.status} /> },
            {
              key: "action",
              header: "",
              render: (item) =>
                canUpdate ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={togglingId === item._id}
                    onClick={() => handleToggleStatus(item._id, item.status === "active" ? "inactive" : "active")}
                    aria-label={item.status === "active" ? `Deactivate ${item.name}` : `Reactivate ${item.name}`}
                  >
                    {item.status === "active" ? <Ban className="size-3.5" /> : <RotateCcw className="size-3.5" />}
                  </Button>
                ) : null,
            },
          ]}
          rows={items}
          getRowKey={(item) => item._id}
          emptyMessage="No items yet."
        />
      </CardContent>
    </Card>
  );
}
