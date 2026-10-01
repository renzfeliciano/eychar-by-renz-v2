"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Logo } from "./logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AccountMenu } from "./account-menu";
import { Breadcrumbs } from "./breadcrumbs";
import { cn } from "@/lib/utils";
import { NavLinks } from "./nav-links";
import { ThemeToggle } from "./theme-toggle";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "workforcehub:sidebar-collapsed";

export function WorkspaceLayout({ account, isSuperAdmin = false, children }: { account: React.ComponentProps<typeof AccountMenu>; isSuperAdmin?: boolean; children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Per-viewer convenience only (rail collapsed or expanded) — never read
  // back by the server, safe to lose in private mode/cleared storage.
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of a per-viewer preference on mount, not a derived/external sync
      if (window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1") setCollapsed(true);
    } catch {
      // localStorage unavailable — rail just defaults to expanded.
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((previous) => {
      const next = !previous;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // ignore — nothing to persist to
      }
      return next;
    });
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside
        className={cn(
          "hidden shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex print:hidden",
          collapsed ? "w-[72px]" : "w-64",
        )}
      >
        <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-5">
          <Logo priority />
          {!collapsed && <span className="truncate text-sm font-semibold">WorkforceHub</span>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
          <NavLinks collapsed={collapsed} isSuperAdmin={isSuperAdmin} />
        </div>
        <div className="border-t border-sidebar-border p-2">
          <button
            type="button"
            onClick={toggleCollapsed}
            className={cn(
              "flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              collapsed && "justify-center px-0",
            )}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            data-testid="sidebar-collapse-toggle"
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4 shrink-0" aria-hidden="true" />
            ) : (
              <>
                <PanelLeftClose className="size-4 shrink-0" aria-hidden="true" />
                Collapse
              </>
            )}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass-surface sticky top-0 z-10 flex h-16 shrink-0 items-center gap-3 border-b px-4 md:px-6 print:hidden">
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation"
              data-testid="mobile-nav-open-button"
            >
              <Menu className="size-5" />
            </Button>
            <SheetContent side="left" className="w-72">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Logo />
                  WorkforceHub
                </SheetTitle>
              </SheetHeader>
              {/* Its own scroll area: the sheet is full-height, so without this the lower modules sit off-screen with no way to reach them. */}
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-6" data-testid="mobile-nav-scroll">
                <NavLinks onNavigate={() => setMobileNavOpen(false)} isSuperAdmin={isSuperAdmin} />
              </div>
            </SheetContent>
          </Sheet>

          <Link href="/dashboard" className="text-sm font-medium text-muted-foreground md:hidden">
            WorkforceHub
          </Link>
          <Breadcrumbs />

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden max-w-72 truncate text-sm text-muted-foreground xl:inline">{account.organizationName}</span>
            <span className="hidden h-5 w-px bg-border xl:block" aria-hidden="true" />
            <ThemeToggle />
            <AccountMenu {...account} />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
