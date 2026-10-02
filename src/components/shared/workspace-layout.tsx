"use client";

import { useEffect, useState } from "react";
import { Building2, Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Logo } from "./logo";
import { BrandName } from "./brand-name";
import { BRAND } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AccountMenu } from "./account-menu";
import { Breadcrumbs, MobileHeaderTitle } from "./breadcrumbs";
import { cn } from "@/lib/utils";
import { NavLinks } from "./nav-links";
import { ModuleTabs } from "./module-tabs";
import { ThemeToggle } from "./theme-toggle";

const SIDEBAR_COLLAPSED_STORAGE_KEY = `${BRAND.storagePrefix}:sidebar-collapsed`;

export function WorkspaceLayout({
  account,
  isSuperAdmin = false,
  heldPermissions,
  children,
}: {
  account: React.ComponentProps<typeof AccountMenu>;
  isSuperAdmin?: boolean;
  /** The viewer's permission keys in this organization — the nav hides what they can't open. */
  heldPermissions?: readonly string[];
  children: React.ReactNode;
}) {
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
    <div className="flex h-dvh overflow-hidden bg-background">
      <aside
        className={cn(
          "hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out md:flex print:hidden",
          collapsed ? "w-[68px]" : "w-[248px]",
        )}
        data-testid="app-sidebar"
      >
        <div className={cn("flex h-16 shrink-0 items-center gap-2.5 border-b border-sidebar-border", collapsed ? "justify-center px-0" : "px-4")}>
          <Logo priority className="size-8 rounded-md" />
          {!collapsed && <BrandName className="text-sm" />}
        </div>
        <div className="sidebar-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 py-3">
          <NavLinks collapsed={collapsed} isSuperAdmin={isSuperAdmin} heldPermissions={heldPermissions} />
        </div>
        <div className="shrink-0 border-t border-sidebar-border px-2.5 py-2">
          <button
            type="button"
            onClick={toggleCollapsed}
            className={cn(
              "flex h-8 w-full cursor-pointer items-center gap-3 rounded-md px-2.5 text-[13px] font-medium text-sidebar-foreground/65 transition-colors duration-150 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none",
              collapsed && "justify-center px-0",
            )}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : undefined}
            data-testid="sidebar-collapse-toggle"
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <>
                <PanelLeftClose className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                Collapse
              </>
            )}
          </button>
          {!collapsed && (
            <p className="truncate px-2.5 pt-1.5 text-[11px] text-muted-foreground/80" data-testid="app-footer">
              © {new Date().getFullYear()} {BRAND.fullName}
            </p>
          )}
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
                <SheetTitle className="flex items-center gap-2.5">
                  <Logo className="size-8 rounded-md" />
                  <BrandName className="text-sm" />
                </SheetTitle>
              </SheetHeader>
              {/* Its own scroll area: the sheet is full-height, so without this the lower modules sit off-screen with no way to reach them. */}
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-6" data-testid="mobile-nav-scroll">
                <NavLinks onNavigate={() => setMobileNavOpen(false)} isSuperAdmin={isSuperAdmin} heldPermissions={heldPermissions} />
              </div>
            </SheetContent>
          </Sheet>

          <MobileHeaderTitle />
          <Breadcrumbs />

          {/* The org name gets the room the bar has left (up to a generous cap)
              and truncates only past that, with the full name on hover. */}
          <div className="ml-auto flex min-w-0 items-center gap-3 pl-2">
            <span
              className="hidden min-w-0 items-center gap-2 text-sm text-muted-foreground lg:flex"
              title={account.organizationName}
              data-testid="topbar-organization-name"
            >
              <Building2 className="size-4 shrink-0 text-muted-foreground/70" strokeWidth={1.75} aria-hidden="true" />
              <span className="max-w-[clamp(14rem,34vw,36rem)] truncate">{account.organizationName}</span>
            </span>
            <span className="hidden h-5 w-px shrink-0 bg-border lg:block" aria-hidden="true" />
            <div className="flex shrink-0 items-center gap-2">
              <ThemeToggle />
              <AccountMenu {...account} />
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:p-8 md:pb-[calc(2rem+env(safe-area-inset-bottom))]">
          <div className="mx-auto max-w-6xl">
            <ModuleTabs isSuperAdmin={isSuperAdmin} heldPermissions={heldPermissions} />
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
