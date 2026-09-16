"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { OptionSelect, type SelectOption } from "@/components/shared/option-select";

export function PeopleFilters({ employmentTypes }: { employmentTypes: SelectOption[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => router.push(`/people?${next.toString()}`));
  }

  return (
    <div className="flex items-end gap-4 rounded-lg border p-4 sm:w-64">
      <OptionSelect
        label="Employment type"
        value={searchParams.get("employmentType") ?? ""}
        onChange={(value) => updateParam("employmentType", value)}
        options={employmentTypes}
        placeholder="All"
        testId="people-filter-employment-type"
      />
      {isPending && <p className="text-xs text-muted-foreground">Filtering…</p>}
    </div>
  );
}
