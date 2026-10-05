"use client";

import { useSearchParams } from "next/navigation";
import { usePendingNavigation } from "@/components/shared/navigation-pending";
import { Loader2 } from "lucide-react";
import { OptionSelect, type SelectOption } from "@/components/shared/option-select";

export function PeopleFilters({ employmentTypes }: { employmentTypes: SelectOption[] }) {
  const searchParams = useSearchParams();
  const { isPending, push } = usePendingNavigation();

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    push(`/people?${next.toString()}`);
  }

  return (
    <div className="relative sm:w-56">
      <OptionSelect
        label="Employment type"
        value={searchParams.get("employmentType") ?? ""}
        onChange={(value) => updateParam("employmentType", value)}
        options={employmentTypes}
        placeholder="All"
        testId="people-filter-employment-type"
      />
      {isPending && (
        <span className="absolute top-0 right-0 flex items-center gap-1 text-xs text-muted-foreground" role="status">
          <Loader2 className="size-3 animate-spin" />
          <span className="sr-only sm:not-sr-only">Filtering</span>
        </span>
      )}
    </div>
  );
}
