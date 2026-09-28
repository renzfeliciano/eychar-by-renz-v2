"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { activeNavItem } from "./nav-links";

/** The last crumb under a list page: "New", "Payslips", or "Details" for a record id. */
function subPageLabel(pathname: string): string {
  const segment = pathname.split("/").filter(Boolean).at(-1) ?? "";
  if (/^[0-9a-f]{24}$/i.test(segment)) return "Details";
  const words = segment.replaceAll("-", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * "Payroll › Runs" in the top bar: where you are in the product, and a
 * way back to the list from any detail page under it.
 */
export function Breadcrumbs() {
  const pathname = usePathname();
  const match = activeNavItem(pathname);
  if (!match) {
    // Pages reached from the account menu rather than the sidebar.
    if (!pathname.startsWith("/account/")) return null;
    return (
      <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-sm md:flex">
        <span className="truncate text-muted-foreground">Your account</span>
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden="true" />
        <span className="truncate font-medium" aria-current="page">
          {subPageLabel(pathname)}
        </span>
      </nav>
    );
  }
  const onItemPage = pathname === match.item.href;

  return (
    <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-sm md:flex">
      {match.section.label && (
        <>
          <span className="truncate text-muted-foreground">{match.section.label}</span>
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden="true" />
        </>
      )}
      {onItemPage ? (
        <span className="truncate font-medium" aria-current="page">
          {match.item.label}
        </span>
      ) : (
        <>
          <Link href={match.item.href} className="truncate text-muted-foreground transition-colors hover:text-foreground">
            {match.item.label}
          </Link>
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden="true" />
          <span className="truncate font-medium" aria-current="page">
            {subPageLabel(pathname)}
          </span>
        </>
      )}
    </nav>
  );
}
