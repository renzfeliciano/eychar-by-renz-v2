"use client";

import { useId, useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { FormField } from "./form-field";
import type { SelectOption } from "./option-select";

/**
 * A pick-one list with a search box, for long lists (every employee) where a
 * plain dropdown means scrolling. It is an inline list rather than a popup, so
 * it behaves inside a dialog without layering surprises. Type to narrow, click
 * (or press Enter on the only match) to choose; click the chosen row to clear.
 */
export function SearchableOptionSelect({
  label,
  value,
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
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  emptyMessage?: string;
  required?: boolean;
  description?: string;
  error?: string | null;
  testId?: string;
}) {
  const generatedId = useId();
  const inputId = `searchable-select${generatedId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const listId = `${inputId}-list`;
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    // Every word typed must appear somewhere in the label, in any order ("cruz juan" finds "Juan Dela Cruz").
    const words = needle.split(/\s+/);
    return options.filter((option) => words.every((word) => option.label.toLowerCase().includes(word)));
  }, [options, query]);

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
                if (matches.length === 1) onChange(matches[0].id);
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
        <ul id={listId} role="listbox" aria-label={label} className="max-h-44 overflow-y-auto rounded-lg border bg-card p-1">
          {matches.length === 0 ? (
            <li className="px-2 py-2 text-sm text-muted-foreground">{emptyMessage}</li>
          ) : (
            matches.map((option) => {
              const selected = option.id === value;
              return (
                <li key={option.id} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    onClick={() => onChange(selected ? "" : option.id)}
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
