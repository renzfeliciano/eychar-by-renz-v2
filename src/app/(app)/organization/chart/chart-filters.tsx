"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarClock, Loader2, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SelectOption } from "@/components/shared/option-select";

const ALL = "__all__";
// Terminated/resigned employees never appear on the chart at all (see
// OrgChartService's active-headcount filter), so only currently-active
// statuses are worth offering here.
const EMPLOYMENT_STATUS_OPTIONS: SelectOption[] = [
  { id: "active", label: "Active" },
  { id: "on_leave", label: "On leave" },
];
const FILTER_KEYS = ["search", "organizationUnitId", "positionId", "projectId", "employmentStatus", "asOf"];

function FilterSelect({ label, allLabel, value, options, onChange }: { label: string; allLabel: string; value: string; options: SelectOption[]; onChange: (value: string) => void }) {
  const selected = options.find((option) => option.id === value)?.label ?? allLabel;
  return (
    <Select value={value || ALL} onValueChange={(next) => onChange(!next || next === ALL ? "" : String(next))}>
      <SelectTrigger className="h-9 w-full sm:w-44" aria-label={label}>
        <SelectValue>{selected}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** One compact toolbar: search, unit, position, project, status and a past date, all kept in the URL. */
export function ChartFilters({ units, positions, projects }: { units: SelectOption[]; positions: SelectOption[]; projects: SelectOption[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  // Controlled like the search box: a changing defaultValue warns in Base UI
  // and goes stale. The local copy follows the URL (e.g. the Back button).
  const asOfParam = searchParams.get("asOf") ?? "";
  const [asOf, setAsOf] = useState(asOfParam);
  const [syncedAsOf, setSyncedAsOf] = useState(asOfParam);
  if (asOfParam !== syncedAsOf) {
    setSyncedAsOf(asOfParam);
    setAsOf(asOfParam);
  }

  const navigate = (next: URLSearchParams) => {
    const query = next.toString();
    startTransition(() => router.push(query ? `/organization/chart?${query}` : "/organization/chart"));
  };
  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    navigate(next);
  }
  const activeCount = FILTER_KEYS.filter((key) => searchParams.get(key)).length;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2.5 shadow-[var(--shadow-soft)]">
      <div className="relative w-full sm:w-56">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          aria-label="Search people"
          placeholder="Search by name"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onBlur={() => search !== (searchParams.get("search") ?? "") && updateParam("search", search.trim())}
          onKeyDown={(event) => event.key === "Enter" && updateParam("search", search.trim())}
          className="h-9 pl-9"
        />
      </div>
      <FilterSelect label="Organization unit" allLabel="All units" value={searchParams.get("organizationUnitId") ?? ""} options={units} onChange={(value) => updateParam("organizationUnitId", value)} />
      <FilterSelect label="Position" allLabel="All positions" value={searchParams.get("positionId") ?? ""} options={positions} onChange={(value) => updateParam("positionId", value)} />
      <FilterSelect label="Project" allLabel="All projects" value={searchParams.get("projectId") ?? ""} options={projects} onChange={(value) => updateParam("projectId", value)} />
      <FilterSelect label="Employment status" allLabel="Any status" value={searchParams.get("employmentStatus") ?? ""} options={EMPLOYMENT_STATUS_OPTIONS} onChange={(value) => updateParam("employmentStatus", value)} />
      <label className="relative flex items-center" title="See the chart as it was on a past date">
        <CalendarClock className="pointer-events-none absolute left-3 size-4 text-muted-foreground" aria-hidden="true" />
        <Input
          aria-label="As of date"
          type="date"
          value={asOf}
          onChange={(event) => {
            setAsOf(event.target.value);
            updateParam("asOf", event.target.value);
          }}
          className="h-9 w-44 pl-9"
        />
      </label>
      <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
        {isPending && <Loader2 className="size-3.5 animate-spin" aria-label="Updating" />}
        {activeCount > 0 && (
          <>
            <span>{activeCount === 1 ? "1 filter on" : `${activeCount} filters on`}</span>
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setAsOf("");
                navigate(new URLSearchParams());
              }}
              className="flex h-7 items-center gap-1 rounded-md px-2 font-medium text-foreground hover:bg-muted"
            >
              <X className="size-3.5" aria-hidden="true" />
              Clear filters
            </button>
          </>
        )}
      </div>
    </div>
  );
}
