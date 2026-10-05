"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BRAND } from "@/lib/brand";
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
      <nav aria-label="Breadcrumb" className="hidden min-w-0 shrink-0 items-center gap-1.5 text-sm md:flex">
        <span className="truncate text-muted-foreground">Your account</span>
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden="true" />
        <span className="truncate font-medium" aria-current="page">
          {subPageLabel(pathname)}
        </span>
      </nav>
    );
  }
  // A merged module's screen ("Payroll › Runs") or a plain link ("Organization › People").
  const page = match.tab ?? match.item;
  const parentLabel = match.tab ? match.item.label : match.section.label;
  const onItemPage = pathname === page.href;

  return (
    <nav aria-label="Breadcrumb" className="hidden min-w-0 shrink-0 items-center gap-1.5 text-sm md:flex">
      {parentLabel && (
        <>
          <span className="truncate text-muted-foreground">{parentLabel}</span>
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden="true" />
        </>
      )}
      {onItemPage ? (
        <span className="truncate font-medium" aria-current="page">
          {page.label}
        </span>
      ) : (
        <>
          <Link href={page.href} className="truncate text-muted-foreground transition-colors hover:text-foreground">
            {page.label}
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

/**
 * Where the phone top bar's back link goes from this page, or null on a
 * top-level page: a detail/sub-page goes up one level — to its list
 * ("‹ People" from a profile) or, one deeper, to the record it belongs to.
 */
export function mobileBackTarget(pathname: string): { href: string; label: string } | null {
  const match = activeNavItem(pathname);
  const page = match?.tab ?? match?.item;
  if (!page || pathname === page.href) return null;
  const parent = pathname.replace(/\/[^/]+\/?$/, "");
  if (parent === page.href || !parent.startsWith(`${page.href}/`)) return { href: page.href, label: page.label };
  return { href: parent, label: "Back" };
}

/**
 * The phone top bar's title slot (the breadcrumbs only show from md up):
 * a compact "‹ People" back link on a detail page, the product name
 * everywhere else.
 */
export function MobileHeaderTitle() {
  const pathname = usePathname();
  const back = mobileBackTarget(pathname);
  if (back) {
    return (
      <Link
        href={back.href}
        className="-ml-1 inline-flex h-10 min-w-0 shrink items-center gap-0.5 rounded-md pr-2 pl-1 text-sm font-medium text-muted-foreground hover:text-foreground md:hidden"
        data-testid="mobile-back-link"
      >
        <ChevronLeft className="size-4 shrink-0" aria-hidden="true" />
        <span className="truncate">
          <span className="sr-only">Back to </span>
          {back.label}
        </span>
      </Link>
    );
  }
  return (
    <Link href="/dashboard" className="shrink-0 text-sm font-semibold tracking-tight md:hidden">
      {BRAND.name}
    </Link>
  );
}
