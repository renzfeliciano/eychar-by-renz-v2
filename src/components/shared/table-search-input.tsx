"use client";

import { useRef, useState } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import { usePendingNavigation } from "./navigation-pending";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/** Debounced so typing doesn't navigate on every keystroke; resets to page 1 on every real search.
    `pageParamName` must match whatever page-param name the table's own `buildTableHref` prefix uses
    (default "page"; e.g. "assignmentPage" alongside paramName="assignmentQ"). */
export function TableSearchInput({
  placeholder = "Search…",
  paramName = "q",
  pageParamName = "page",
}: {
  placeholder?: string;
  paramName?: string;
  pageParamName?: string;
}) {
  const { push } = usePendingNavigation();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const paramValue = searchParams.get(paramName) ?? "";
  const [value, setValue] = useState(paramValue);
  // Resets the field when the URL's own value changes from outside this
  // input (browser back/forward, a Clear elsewhere) — adjusting state
  // during render, per React's docs, instead of an effect-triggered
  // extra render pass.
  const [trackedParamValue, setTrackedParamValue] = useState(paramValue);
  if (paramValue !== trackedParamValue) {
    setTrackedParamValue(paramValue);
    setValue(paramValue);
  }
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function commit(nextValue: string) {
    const params = new URLSearchParams(searchParams);
    if (nextValue) params.set(paramName, nextValue);
    else params.delete(paramName);
    params.delete(pageParamName);
    push(`${pathname}?${params.toString()}`);
  }

  function handleChange(nextValue: string) {
    setValue(nextValue);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => commit(nextValue), 350);
  }

  return (
    <div className="relative w-full sm:max-w-xs">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        placeholder={placeholder}
        className="pl-8"
        aria-label={placeholder}
        data-testid="table-search-input"
      />
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute top-1/2 right-1 -translate-y-1/2"
          onClick={() => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            handleChange("");
            commit("");
          }}
          aria-label="Clear search"
        >
          <X className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
