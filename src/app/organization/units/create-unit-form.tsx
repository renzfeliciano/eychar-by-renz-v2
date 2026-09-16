"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type UnitOption = { id: string; name: string };

export function CreateUnitForm({ organizationId, units }: { organizationId: string; units: UnitOption[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [type, setType] = useState("");
  const [parentUnitId, setParentUnitId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch("/api/organization-units", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId,
        name,
        code,
        type,
        parentUnitId: parentUnitId || undefined,
      }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to create organization unit.");
      return;
    }

    setName("");
    setCode("");
    setType("");
    setParentUnitId("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 rounded border p-4" style={{ borderColor: "var(--line)" }}>
      <label className="text-sm">
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} required className="mt-1 block rounded border px-2 py-1" style={{ borderColor: "var(--line)" }} />
      </label>
      <label className="text-sm">
        Code
        <input value={code} onChange={(e) => setCode(e.target.value)} required className="mt-1 block rounded border px-2 py-1" style={{ borderColor: "var(--line)" }} />
      </label>
      <label className="text-sm">
        Type
        <input value={type} onChange={(e) => setType(e.target.value)} required placeholder="e.g. department" className="mt-1 block rounded border px-2 py-1" style={{ borderColor: "var(--line)" }} />
      </label>
      <label className="text-sm">
        Parent unit
        <select value={parentUnitId} onChange={(e) => setParentUnitId(e.target.value)} className="mt-1 block rounded border px-2 py-1" style={{ borderColor: "var(--line)" }}>
          <option value="">None</option>
          {units.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={isSubmitting} className="rounded px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60" style={{ background: "var(--accent)" }}>
        {isSubmitting ? "Adding…" : "Add unit"}
      </button>
      {error && <p role="alert" className="w-full text-sm" style={{ color: "var(--danger)" }}>{error}</p>}
    </form>
  );
}
