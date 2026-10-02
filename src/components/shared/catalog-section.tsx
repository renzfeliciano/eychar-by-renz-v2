"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Ban, RotateCcw, Save } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardAction, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormField, FormError, RequiredFieldsHint } from "@/components/shared/form-field";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
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
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<CatalogItemRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);

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
    toast.success("Catalog updated");
    router.refresh();
  }

  async function handleToggleStatus(id: string, nextStatus: "active" | "inactive") {
    setTogglingId(id);
    setToggleError(null);
    try {
      const response = await fetch(`/api/catalogs/${catalogType}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, status: nextStatus }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to update item.");
      }
      toast.success("Catalog updated");
      router.refresh();
    } finally {
      setTogglingId(null);
    }
  }

  function openEditDialog(item: CatalogItemRow) {
    setEditingItem(item);
    setEditName(item.name);
    setEditDescription(item.description ?? "");
    setEditError(null);
  }

  async function handleEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingItem) return;
    setEditError(null);
    setIsEditSubmitting(true);

    const response = await fetch(`/api/catalogs/${catalogType}/${editingItem._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, name: editName, description: editDescription }),
    });

    setIsEditSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setEditError(body.error ?? "Failed to update item.");
      return;
    }

    setEditingItem(null);
    toast.success("Catalog updated");
    router.refresh();
  }

  const formId = `catalog-form-${catalogType}`;
  const editFormId = `catalog-edit-form-${catalogType}`;

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setName("");
      setItemDescription("");
      setError(null);
    }
    setOpen(nextOpen);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        {canCreate && (
          <CardAction>
            <Dialog open={open} onOpenChange={handleOpenChange}>
              <DialogTrigger className={cn(buttonVariants({ size: "sm" }))} data-testid={`catalog-${catalogType}-add-button`}>
                <Plus className="size-3.5" />
                Add
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add {title.toLowerCase()} item</DialogTitle>
                </DialogHeader>
                <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <RequiredFieldsHint />
                  <FormField label="Name" htmlFor={`${formId}-name`} required>
                    <Input id={`${formId}-name`} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Regular" required />
                  </FormField>
                  <FormField label="Description" htmlFor={`${formId}-description`}>
                    <Input id={`${formId}-description`} value={itemDescription} onChange={(event) => setItemDescription(event.target.value)} placeholder="e.g. Standard, full-time employment" />
                  </FormField>
                  <FormError message={error} />
                </form>
                <DialogFooter>
                  <Button type="submit" form={formId} data-testid={`catalog-${catalogType}-add-submit-button`} icon={Plus} pending={isSubmitting} pendingLabel="Adding…">
                    Add
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardAction>
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
              render: (item) => {
                if (!canUpdate) return null;
                const isToggling = togglingId === item._id;
                return (
                  <div className="flex items-center justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEditDialog(item)} aria-label={`Edit ${item.name}`} data-testid={`catalog-${catalogType}-edit-button-${item._id}`}>
                      <Pencil className="size-3.5" />
                    </Button>
                    {item.status === "active" ? (
                      <ConfirmDialog
                        trigger={
                          <Button size="icon-sm" variant="ghost" icon={Ban} pending={isToggling} aria-label={isToggling ? `Deactivating ${item.name}` : `Deactivate ${item.name}`} />
                        }
                        title={`Deactivate "${item.name}"?`}
                        description="It stops appearing as a choice in new records — anything already using it is unaffected."
                        confirmLabel="Deactivate"
                        confirmLoadingLabel="Deactivating…"
                        onConfirm={() => handleToggleStatus(item._id, "inactive")}
                      />
                    ) : (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        icon={RotateCcw}
                        pending={isToggling}
                        onClick={() => handleToggleStatus(item._id, "active").catch((err) => setToggleError(err instanceof Error ? err.message : "Failed to update item."))}
                        aria-label={isToggling ? `Reactivating ${item.name}` : `Reactivate ${item.name}`}
                      />
                    )}
                  </div>
                );
              },
            },
          ]}
          rows={items}
          getRowKey={(item) => item._id}
          emptyMessage="No items yet."
        />
        <FormError message={toggleError} />
      </CardContent>

      <Dialog open={editingItem !== null} onOpenChange={(nextOpen) => !nextOpen && setEditingItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {title.toLowerCase()} item</DialogTitle>
          </DialogHeader>
          <form id={editFormId} onSubmit={handleEditSubmit} className="flex flex-col gap-4">
            <RequiredFieldsHint />
            <FormField label="Name" htmlFor={`${editFormId}-name`} required>
              <Input id={`${editFormId}-name`} value={editName} onChange={(event) => setEditName(event.target.value)} placeholder="e.g. Regular" required />
            </FormField>
            <FormField label="Description" htmlFor={`${editFormId}-description`}>
              <Input id={`${editFormId}-description`} value={editDescription} onChange={(event) => setEditDescription(event.target.value)} placeholder="e.g. Standard, full-time employment" />
            </FormField>
            <FormError message={editError} />
          </form>
          <DialogFooter>
            <Button type="submit" form={editFormId} data-testid={`catalog-${catalogType}-edit-submit-button`} icon={Save} pending={isEditSubmitting} pendingLabel="Saving…">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
