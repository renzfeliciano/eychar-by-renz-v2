"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function CreateLocationForm({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch("/api/locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, name, code, address: address || undefined }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to create location.");
      return;
    }

    setName("");
    setCode("");
    setAddress("");
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
        Address
        <input value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1 block rounded border px-2 py-1" style={{ borderColor: "var(--line)" }} />
      </label>
      <button type="submit" disabled={isSubmitting} className="rounded px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60" style={{ background: "var(--accent)" }}>
        {isSubmitting ? "Adding…" : "Add location"}
      </button>
      {error && <p role="alert" className="w-full text-sm" style={{ color: "var(--danger)" }}>{error}</p>}
    </form>
  );
}
