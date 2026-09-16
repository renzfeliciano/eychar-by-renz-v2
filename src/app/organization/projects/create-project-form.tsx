"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type LocationOption = { id: string; name: string };

export function CreateProjectForm({ organizationId, locations }: { organizationId: string; locations: LocationOption[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [locationId, setLocationId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, name, code, locationId: locationId || undefined }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to create project.");
      return;
    }

    setName("");
    setCode("");
    setLocationId("");
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
        Location
        <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="mt-1 block rounded border px-2 py-1" style={{ borderColor: "var(--line)" }}>
          <option value="">None</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={isSubmitting} className="rounded px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60" style={{ background: "var(--accent)" }}>
        {isSubmitting ? "Adding…" : "Add project"}
      </button>
      {error && <p role="alert" className="w-full text-sm" style={{ color: "var(--danger)" }}>{error}</p>}
    </form>
  );
}
