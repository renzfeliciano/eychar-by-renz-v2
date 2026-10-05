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
    // A segmented control: one ruled strip, the chosen status filled in navy.
    <nav aria-label="Filter by status" className="flex max-w-full gap-0.5 self-start overflow-x-auto rounded-lg border bg-card p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {options.map((option) => {
        const isActive = active === option.value;
        return (
          <Link
            key={option.value}
            href={buildTableHref(basePath, params, { [paramName]: option.value === "all" ? undefined : option.value, page: undefined })}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[13px] max-md:min-h-9 transition-[color,background-color] duration-150",
              isActive ? "bg-primary font-medium text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {option.label}
            <span className={cn("text-xs tabular-nums", isActive ? "text-primary-foreground/70" : "text-muted-foreground/80")}>{option.count}</span>
          </Link>
        );
      })}
    </nav>
  );
}
