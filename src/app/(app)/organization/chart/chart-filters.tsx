"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { OptionSelect, type SelectOption } from "@/components/shared/option-select";
import { FormField } from "@/components/shared/form-field";

const EMPLOYMENT_STATUS_OPTIONS: SelectOption[] = [
  { id: "active", label: "Active" },
  { id: "on_leave", label: "On leave" },
  { id: "terminated", label: "Terminated" },
];

export function ChartFilters({
  units,
  positions,
  projects,
}: {
  units: SelectOption[];
  positions: SelectOption[];
  projects: SelectOption[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => router.push(`/organization/chart?${next.toString()}`));
  }

  return (
    <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-5">
      <FormField label="Search" htmlFor="chart-search">
        <Input
          id="chart-search"
          placeholder="Employee name"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onBlur={() => updateParam("search", search)}
          onKeyDown={(event) => event.key === "Enter" && updateParam("search", search)}
        />
      </FormField>
      <OptionSelect label="Organization unit" value={searchParams.get("organizationUnitId") ?? ""} onChange={(v) => updateParam("organizationUnitId", v)} options={units} placeholder="All" />
      <OptionSelect label="Position" value={searchParams.get("positionId") ?? ""} onChange={(v) => updateParam("positionId", v)} options={positions} placeholder="All" />
      <OptionSelect label="Project" value={searchParams.get("projectId") ?? ""} onChange={(v) => updateParam("projectId", v)} options={projects} placeholder="All" />
      <OptionSelect
        label="Employment status"
        value={searchParams.get("employmentStatus") ?? ""}
        onChange={(v) => updateParam("employmentStatus", v)}
        options={EMPLOYMENT_STATUS_OPTIONS}
        placeholder="All"
      />
      <FormField label="As of date" htmlFor="chart-as-of">
        <Input
          id="chart-as-of"
          type="date"
          defaultValue={searchParams.get("asOf") ?? ""}
          onChange={(event) => updateParam("asOf", event.target.value)}
        />
      </FormField>
      {isPending && <p className="text-xs text-muted-foreground">Updating…</p>}
    </div>
  );
}
