"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RevokeRoleAssignmentButton({ id, organizationId }: { id: string; organizationId: string }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleClick() {
    setIsSubmitting(true);
    await fetch(`/api/role-assignments/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId }),
    });
    setIsSubmitting(false);
    router.refresh();
  }

  return (
    <Button type="button" variant="ghost" size="sm" onClick={handleClick} disabled={isSubmitting} aria-label="Revoke role">
      {isSubmitting ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
    </Button>
  );
}
