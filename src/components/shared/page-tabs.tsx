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
    <nav aria-label={label} className="-mx-1 flex gap-1 overflow-x-auto border-b px-1">
      {tabs.map(({ value, label: tabLabel, href, count, icon: Icon }) => {
        const isActive = value === active;
        return (
          <Link
            key={value}
            href={href}
            scroll={false}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative -mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              isActive ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
            )}
          >
            {Icon && <Icon className="size-4" aria-hidden="true" />}
            {tabLabel}
            {count !== undefined && (
              <span className={cn("rounded-full px-1.5 text-xs tabular-nums", isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>{count}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
