import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type PageTab = { value: string; label: string; href: string; count?: number; icon?: LucideIcon };

/**
 * Underlined section tabs for a record's page (an employee profile, a
 * review cycle). Each tab is a link, so the section is in the URL and
 * survives a refresh, a bookmark or the Back button.
 */
export function PageTabs({ label, tabs, active }: { label: string; tabs: PageTab[]; active: string }) {
  return (
    <nav aria-label={label} className="-mx-1 flex gap-5 overflow-x-auto border-b px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map(({ value, label: tabLabel, href, count }) => {
        const isActive = value === active;
        return (
          <Link
            key={value}
            href={href}
            scroll={false}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative -mb-px flex shrink-0 items-center gap-1.5 border-b-2 py-2.5 text-sm whitespace-nowrap transition-colors duration-150",
              isActive ? "border-primary font-semibold text-foreground" : "border-transparent font-medium text-muted-foreground hover:border-input hover:text-foreground",
            )}
          >
            {tabLabel}
            {count !== undefined && <span className="text-xs font-normal text-muted-foreground tabular-nums">{count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
