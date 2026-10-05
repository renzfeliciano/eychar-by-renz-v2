"use client";

import { createContext, useCallback, useContext, useMemo, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

type PendingNavigation = { isPending: boolean; push: (href: string) => void };

const PendingNavigationContext = createContext<PendingNavigation | null>(null);

/**
 * Loading feedback for navigations that stay on the same page: a filter,
 * a sort, the next page of a table, another date or month, a profile tab.
 * Next keeps the old page on screen until the new one is ready (loading.tsx
 * only shows when you open a different page), so without this nothing
 * moved between the click and the new rows. While one is running, the
 * content dims, says it's busy, and a bar runs along the top.
 *
 * Plain links inside the region are picked up automatically when they only
 * change the query string; code that navigates itself uses
 * `usePendingNavigation().push`.
 */
export function PendingNavigationRegion({ className, children }: { className?: string; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const push = useCallback((href: string) => startTransition(() => router.push(href, { scroll: false })), [router]);
  const value = useMemo(() => ({ isPending, push }), [isPending, push]);

  function onClickCapture(event: React.MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as Element).closest("a[href]");
    if (!(anchor instanceof HTMLAnchorElement) || (anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;
    const url = new URL(anchor.href, window.location.href);
    // Only same-page, query-string changes; other pages have their own loading.tsx skeleton.
    if (url.origin !== window.location.origin || url.pathname !== pathname || url.search === window.location.search) return;
    event.preventDefault();
    push(`${url.pathname}${url.search}${url.hash}`);
  }

  return (
    <PendingNavigationContext.Provider value={value}>
      {isPending && (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-primary/15" aria-hidden="true" data-testid="navigation-pending-bar">
          <div className="page-loader-bar h-full w-1/3 rounded-full bg-primary" />
        </div>
      )}
      <div
        onClickCapture={onClickCapture}
        aria-busy={isPending || undefined}
        data-pending={isPending || undefined}
        className={cn("transition-opacity duration-200 data-pending:opacity-55 data-pending:delay-150", className)}
      >
        {children}
      </div>
    </PendingNavigationContext.Provider>
  );
}

/** `push` that drives the region's busy state; a plain router push outside a region. */
export function usePendingNavigation(): PendingNavigation {
  const router = useRouter();
  const context = useContext(PendingNavigationContext);
  return context ?? { isPending: false, push: (href: string) => router.push(href) };
}
