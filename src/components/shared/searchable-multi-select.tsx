"use client";

import { useId, useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { FormField } from "./form-field";
import type { SelectOption } from "./option-select";
import { matchOptions } from "./searchable-options";

/**
 * The pick-several twin of SearchableOptionSelect, for long lists (every employee) where ticking boxes in a
 * scrolling list is slow: the same search box and inline list, with the same word-in-any-order search. Click a
 * row to add or remove it (press Enter on the only match to do the same); who is chosen stays chosen while
 * the search narrows, and the line above the list counts them, with Clear all.
 */
export function SearchableMultiSelect({
  label,
  values,
  onChange,
  options,
  placeholder = "Search…",
  emptyMessage = "No match.",
  required,
  description,
  error,
  testId,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  options: SelectOption[];
  placeholder?: string;
  emptyMessage?: string;
  required?: boolean;
  description?: string;
  error?: string | null;
  testId?: string;
}) {
  const generatedId = useId();
  const inputId = `searchable-multi${generatedId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const listId = `${inputId}-list`;
  const [query, setQuery] = useState("");

  const matches = useMemo(() => matchOptions(options, query), [options, query]);
  const chosen = useMemo(() => new Set(values), [values]);

  function toggle(id: string) {
    onChange(chosen.has(id) ? values.filter((value) => value !== id) : [...values, id]);
  }

  return (
    <FormField label={label} htmlFor={inputId} required={required} error={error} description={description}>
      <div className="flex flex-col gap-1.5" data-testid={testId}>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id={inputId}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (matches.length === 1) toggle(matches[0].id);
              }
            }}
            placeholder={placeholder}
            className="pl-8"
            autoComplete="off"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
          />
        </div>
        {values.length > 0 && (
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{values.length} selected</span>
            <button type="button" onClick={() => onChange([])} className="cursor-pointer rounded-sm underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none">
              Clear all
            </button>
          </div>
        )}
        <ul id={listId} role="listbox" aria-label={label} aria-multiselectable="true" className="max-h-44 overflow-y-auto rounded-lg border bg-card p-1">
          {matches.length === 0 ? (
            <li className="px-2 py-2 text-sm text-muted-foreground">{emptyMessage}</li>
          ) : (
            matches.map((option) => {
              const selected = chosen.has(option.id);
              return (
                <li key={option.id} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    onClick={() => toggle(option.id)}
                    className={cn(
                      "flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40",
                      selected && "bg-accent font-medium",
                    )}
                  >
                    <span className="truncate">{option.label}</span>
                    {selected && <Check className="size-4 shrink-0 text-primary" />}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </FormField>
  );
}
