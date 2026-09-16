"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
      <button
        type="button"
        onClick={handleClick}
        disabled={isSubmitting}
        className="rounded border px-3 py-1.5 text-sm font-medium disabled:opacity-60"
        style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
      >
        {isSubmitting ? "Terminating…" : "Terminate employment"}
      </button>
      {error && <p role="alert" className="mt-2 text-sm" style={{ color: "var(--danger)" }}>{error}</p>}
    </div>
  );
}
