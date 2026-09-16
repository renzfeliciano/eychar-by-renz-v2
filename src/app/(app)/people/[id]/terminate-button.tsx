"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/shared/form-field";

export function TerminateButton({ employeeId, organizationId }: { employeeId: string; organizationId: string }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    setIsSubmitting(true);

    const response = await fetch(`/api/employees/${employeeId}/employment`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to terminate employment.");
      return;
    }

    router.refresh();
  }

  return (
    <div>
      <Button type="button" variant="destructive" onClick={handleClick} disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <UserX className="size-4" />}
        {isSubmitting ? "Terminating…" : "Terminate employment"}
      </Button>
      <FormError message={error} />
    </div>
  );
}
