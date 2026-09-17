"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, ShieldCheck } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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

export type PermissionOption = { key: string; description?: string | null; category: string };

export type RoleFormValue = {
  id: string;
  name: string;
  description?: string | null;
  permissionKeys: string[];
  status: "active" | "inactive";
};

export function RoleFormDialog({
  organizationId,
  availablePermissions,
  initialValue,
}: {
  organizationId: string;
  availablePermissions: PermissionOption[];
  initialValue?: RoleFormValue;
}) {
  const isEdit = Boolean(initialValue);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialValue?.name ?? "");
  const [description, setDescription] = useState(initialValue?.description ?? "");
  const [permissionKeys, setPermissionKeys] = useState<string[]>(initialValue?.permissionKeys ?? []);
  const [status, setStatus] = useState<"active" | "inactive">(initialValue?.status ?? "active");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const permissionsByCategory = new Map<string, PermissionOption[]>();
  for (const permission of availablePermissions) {
    const list = permissionsByCategory.get(permission.category) ?? [];
    list.push(permission);
    permissionsByCategory.set(permission.category, list);
  }

  function togglePermission(key: string, checked: boolean) {
    setPermissionKeys((current) => (checked ? [...current, key] : current.filter((existing) => existing !== key)));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch(isEdit ? `/api/roles/${initialValue!.id}` : "/api/roles", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, name, description: description || undefined, permissionKeys, status }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? `Failed to ${isEdit ? "save" : "create"} role.`);
      return;
    }

    if (!isEdit) {
      setName("");
      setDescription("");
      setPermissionKeys([]);
      setStatus("active");
    }
    setOpen(false);
    router.refresh();
  }

  const formId = `role-form-${initialValue?.id ?? "new"}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className={cn(isEdit ? buttonVariants({ size: "sm", variant: "ghost" }) : buttonVariants({ size: "sm" }))}
        aria-label={isEdit ? "Edit role" : undefined}
        data-testid={isEdit ? "role-edit-button" : "roles-create-button"}
      >
        {isEdit ? (
          <Pencil className="size-3.5" />
        ) : (
          <>
            <Plus className="size-3.5" />
            Add role
          </>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit role" : "Add role"}</DialogTitle>
        </DialogHeader>
        <form id={formId} onSubmit={handleSubmit} className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto pr-1">
          <RequiredFieldsHint />
          <FormField label="Name" htmlFor={`${formId}-name`} required>
            <Input id={`${formId}-name`} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Building Administrator" required />
          </FormField>
          <FormField label="Description" htmlFor={`${formId}-description`}>
            <Textarea id={`${formId}-description`} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="e.g. Manages building staff records and schedules" />
          </FormField>
          <FormField label="Permissions" htmlFor={`${formId}-permissions`}>
            <div id={`${formId}-permissions`} className="flex max-h-64 flex-col gap-3 overflow-y-auto rounded-lg border p-3">
              {[...permissionsByCategory.entries()].map(([category, permissions]) => (
                <div key={category} className="flex flex-col gap-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase">{category}</p>
                  {permissions.map((permission) => (
                    <label key={permission.key} className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-accent/40">
                      <Checkbox
                        checked={permissionKeys.includes(permission.key)}
                        onCheckedChange={(checked) => togglePermission(permission.key, checked === true)}
                      />
                      <span>{permission.description || permission.key}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </FormField>
          {isEdit && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={status === "inactive"} onCheckedChange={(checked) => setStatus(checked === true ? "inactive" : "active")} />
              Retire this role (immediately stops it from granting access)
            </label>
          )}
          <FormError message={error} />
        </form>
        <DialogFooter>
          <Button type="submit" form={formId} disabled={isSubmitting} data-testid={isEdit ? "role-save-button" : "roles-create-submit-button"}>
            {isEdit ? (
              isSubmitting ? "Saving…" : "Save changes"
            ) : (
              <>
                <ShieldCheck className="size-3.5" />
                {isSubmitting ? "Adding…" : "Add role"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
