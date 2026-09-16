"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type Option = { id: string; label: string };

export function TransferForm({
  employeeId,
  organizationId,
  positions,
  projects,
  managers,
}: {
  employeeId: string;
  organizationId: string;
  positions: Option[];
  projects: Option[];
  managers: Option[];
}) {
  const router = useRouter();
  const [positionId, setPositionId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [reportsToEmployeeId, setReportsToEmployeeId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch(`/api/employees/${employeeId}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId,
        positionId: positionId || undefined,
        projectId: projectId || undefined,
        reportsToEmployeeId: reportsToEmployeeId || undefined,
      }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to transfer employee.");
      return;
    }

    setPositionId("");
    setProjectId("");
    setReportsToEmployeeId("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 rounded border p-4" style={{ borderColor: "var(--line)" }}>
      <label className="text-sm">
        New position
        <select value={positionId} onChange={(e) => setPositionId(e.target.value)} className="mt-1 block rounded border px-2 py-1" style={{ borderColor: "var(--line)" }}>
          <option value="">None</option>
          {positions.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        New project
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="mt-1 block rounded border px-2 py-1" style={{ borderColor: "var(--line)" }}>
          <option value="">None</option>
          {projects.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        New manager
        <select value={reportsToEmployeeId} onChange={(e) => setReportsToEmployeeId(e.target.value)} className="mt-1 block rounded border px-2 py-1" style={{ borderColor: "var(--line)" }}>
          <option value="">None</option>
          {managers.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={isSubmitting} className="rounded px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60" style={{ background: "var(--accent)" }}>
        {isSubmitting ? "Transferring…" : "Transfer"}
      </button>
      {error && <p role="alert" className="w-full text-sm" style={{ color: "var(--danger)" }}>{error}</p>}
    </form>
  );
}
