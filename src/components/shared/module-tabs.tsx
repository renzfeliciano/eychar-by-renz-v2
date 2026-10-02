"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { activeNavItem, visibleTabs } from "./nav-links";

/**
 * The tab strip above a merged module's pages (Leave: Requests | Balances,
 * Setup: Units | Positions | …). It only appears on a module's own screens
 * (not on a record inside one, like a payroll run), lists only the tabs the
 * viewer may open, and each tab is the page's normal URL, so bookmarks and
 * Back keep working.
 */
export function ModuleTabs({ isSuperAdmin = false, heldPermissions }: { isSuperAdmin?: boolean; heldPermissions?: readonly string[] }) {
  const pathname = usePathname();
  const active = activeNavItem(pathname);
  if (!active?.tab || pathname !== active.tab.href) return null;
  const tabs = visibleTabs(active.item, { isSuperAdmin, heldPermissions });
  if (tabs.length < 2) return null;

  return (
    <nav aria-label={active.item.label} className="-mx-1 mb-6 flex gap-1 overflow-x-auto border-b px-1 print:hidden" data-testid="module-tabs">
      {tabs.map((tab) => {
        const isActive = tab.href === active.tab!.href;
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative -mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
              isActive ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
