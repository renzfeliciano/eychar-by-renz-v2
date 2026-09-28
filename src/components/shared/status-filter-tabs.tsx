import Link from "next/link";
import { buildTableHref } from "@/lib/table-query";
import { cn } from "@/lib/utils";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Pill tabs that filter a list by status, each with its count, driven by
 * the URL (`?status=`) like the rest of the table controls. "All" clears it.
 */
export function StatusFilterTabs({
  basePath,
  params,
  active,
  options,
  paramName = "status",
}: {
  basePath: string;
  params: SearchParams;
  active: string;
  options: { value: string; label: string; count: number }[];
  paramName?: string;
}) {
  return (
    <nav aria-label="Filter by status" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {options.map((option) => {
        const isActive = active === option.value;
        return (
          <Link
            key={option.value}
            href={buildTableHref(basePath, params, { [paramName]: option.value === "all" ? undefined : option.value, page: undefined })}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-[color,background-color,border-color] duration-150",
              isActive ? "border-primary bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:border-ring/50 hover:text-foreground",
            )}
          >
            {option.label}
            <span className={cn("rounded-full px-1.5 text-xs tabular-nums", isActive ? "bg-primary/15" : "bg-muted")}>{option.count}</span>
          </Link>
        );
      })}
    </nav>
  );
}
