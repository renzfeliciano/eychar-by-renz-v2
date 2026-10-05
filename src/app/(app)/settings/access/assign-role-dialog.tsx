"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { UserPlus, UserCheck } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { FormError, FormField, RequiredFieldsHint } from "@/components/shared/form-field";
import { OptionSelect, type SelectOption } from "@/components/shared/option-select";
import { cn } from "@/lib/utils";

type ScopeType = "organization" | "project";

export function AssignRoleDialog({
  organizationId,
  members,
  roles,
  projects,
}: {
  organizationId: string;
  members: SelectOption[];
  roles: SelectOption[];
  /** The organization's projects, for a role that applies only on some of them. */
  projects: SelectOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [scopeType, setScopeType] = useState<ScopeType>("organization");
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function reset() {
    setUserId("");
    setRoleId("");
    setScopeType("organization");
    setProjectIds([]);
    setError(null);
    setProjectsError(null);
  }

  function toggleProject(id: string, checked: boolean) {
    setProjectIds((current) => (checked ? [...new Set([...current, id])] : current.filter((projectId) => projectId !== id)));
    setProjectsError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setProjectsError(null);

    if (!userId || !roleId) {
      setError("Select a person and a role.");
      return;
    }
    if (scopeType === "project" && projectIds.length === 0) {
      setProjectsError("Choose at least one project.");
      return;
    }
    setIsSubmitting(true);

    const scope = scopeType === "project" ? { type: "project", projectIds } : { type: "organization" };
    const response = await fetch("/api/role-assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, userId, roleId, scope }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to assign role.");
      return;
    }

    reset();
    setOpen(false);
    toast.success(scopeType === "project" ? `Role assigned on ${projectIds.length} ${projectIds.length === 1 ? "project" : "projects"}` : "Role assigned");
    router.refresh();
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) reset();
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
          <DialogDescription>Grants a person a role and its permissions, effective immediately — across the organization or only on chosen projects.</DialogDescription>
        </DialogHeader>
        <form id="assign-role-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <RequiredFieldsHint />
          <OptionSelect label="Person" value={userId} onChange={setUserId} options={members} placeholder="Select a person" required />
          <OptionSelect label="Role" value={roleId} onChange={setRoleId} options={roles} placeholder="Select a role" required />
          <FormField label="Applies to" htmlFor="assign-role-scope">
            <div id="assign-role-scope" role="radiogroup" aria-label="Applies to" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" data-testid="assign-role-scope">
              {(["organization", "project"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={scopeType === value}
                  onClick={() => {
                    setScopeType(value);
                    setProjectsError(null);
                  }}
                  disabled={value === "project" && projects.length === 0}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-[color,background-color,box-shadow] duration-150 disabled:cursor-not-allowed disabled:opacity-50",
                    scopeType === value ? "bg-card text-foreground shadow-[0_1px_2px_oklch(0.235_0.028_262/10%)] ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {value === "organization" ? "Whole organization" : "Specific projects"}
                </button>
              ))}
            </div>
          </FormField>
          {scopeType === "project" && (
            <FormField
              label="Projects"
              htmlFor="assign-role-projects"
              required
              error={projectsError}
              description="The role's permissions apply only to these projects' data."
            >
              <div
                id="assign-role-projects"
                role="group"
                aria-label="Projects"
                className="flex max-h-56 flex-col gap-0.5 overflow-y-auto rounded-lg border p-2"
                data-testid="assign-role-projects"
              >
                {projects.map((project) => (
                  <label key={project.id} className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-accent/40">
                    <Checkbox checked={projectIds.includes(project.id)} onCheckedChange={(checked) => toggleProject(project.id, checked === true)} />
                    <span>{project.label}</span>
                  </label>
                ))}
              </div>
            </FormField>
          )}
          <FormError message={error} />
        </form>
        <DialogFooter>
          <Button type="submit" form="assign-role-form" data-testid="assign-role-submit-button" icon={UserCheck} pending={isSubmitting} pendingLabel="Assigning…">
            Assign role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
