"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type Option = { id: string; label: string };

export function HireForm({
  organizationId,
  positions,
  projects,
  managers,
}: {
  organizationId: string;
  positions: Option[];
  projects: Option[];
  managers: Option[];
}) {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [positionId, setPositionId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [reportsToEmployeeId, setReportsToEmployeeId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch("/api/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId,
        firstName,
        lastName,
        employeeNumber,
        employmentType,
        positionId: positionId || undefined,
        projectId: projectId || undefined,
        reportsToEmployeeId: reportsToEmployeeId || undefined,
      }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to hire employee.");
      return;
    }

    router.push("/people");
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-lg flex-col gap-3 rounded border p-4" style={{ borderColor: "var(--line)" }}>
      <label className="text-sm">
        First name
        <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required className="mt-1 block w-full rounded border px-2 py-1" style={{ borderColor: "var(--line)" }} />
      </label>
      <label className="text-sm">
        Last name
        <input value={lastName} onChange={(e) => setLastName(e.target.value)} required className="mt-1 block w-full rounded border px-2 py-1" style={{ borderColor: "var(--line)" }} />
      </label>
      <label className="text-sm">
        Employee number
        <input value={employeeNumber} onChange={(e) => setEmployeeNumber(e.target.value)} required className="mt-1 block w-full rounded border px-2 py-1" style={{ borderColor: "var(--line)" }} />
      </label>
      <label className="text-sm">
        Employment type
        <input value={employmentType} onChange={(e) => setEmploymentType(e.target.value)} required placeholder="e.g. regular" className="mt-1 block w-full rounded border px-2 py-1" style={{ borderColor: "var(--line)" }} />
      </label>
      <label className="text-sm">
        Position
        <select value={positionId} onChange={(e) => setPositionId(e.target.value)} className="mt-1 block w-full rounded border px-2 py-1" style={{ borderColor: "var(--line)" }}>
          <option value="">None</option>
          {positions.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Project
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="mt-1 block w-full rounded border px-2 py-1" style={{ borderColor: "var(--line)" }}>
          <option value="">None</option>
          {projects.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Reports to
        <select value={reportsToEmployeeId} onChange={(e) => setReportsToEmployeeId(e.target.value)} className="mt-1 block w-full rounded border px-2 py-1" style={{ borderColor: "var(--line)" }}>
          <option value="">None</option>
          {managers.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      </label>

      {error && <p role="alert" className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>}

      <button type="submit" disabled={isSubmitting} className="rounded px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60" style={{ background: "var(--accent)" }}>
        {isSubmitting ? "Hiring…" : "Hire employee"}
      </button>
    </form>
  );
}
