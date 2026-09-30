"use client";

// data-testid convention used across this app: "<feature>-<element>-<action?>",
// kebab-case (e.g. "payroll-generate-run-button", "leave-types-create-button").
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Building2,
  Briefcase,
  MapPin,
  FolderKanban,
  Users,
  Network,
  ClipboardCheck,
  CalendarRange,
  Settings2,
  CalendarDays,
  Tags,
  ScrollText,
  Wallet,
  Banknote,
  CalendarClock,
  FileSpreadsheet,
  Settings,
  KanbanSquare,
  ChevronDown,
  Star,
  Gavel,
  Plane,
  ShieldCheck,
  UserCog,
  UserMinus,
} from "lucide-react";

export const NAV_SECTIONS = [
  {
    label: null,
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Organization",
    items: [
      { href: "/organization/units", label: "Units", icon: Building2 },
      { href: "/organization/positions", label: "Positions", icon: Briefcase },
      { href: "/organization/locations", label: "Locations", icon: MapPin },
      { href: "/organization/projects", label: "Projects", icon: FolderKanban },
      { href: "/organization/chart", label: "Chart", icon: Network },
    ],
  },
  {
    label: "Workforce",
    items: [
      { href: "/people", label: "People", icon: Users },
      { href: "/travel-orders", label: "Travel orders", icon: Plane },
      { href: "/clearance", label: "Clearance", icon: UserMinus },
    ],
  },
  {
    label: "Attendance",
    items: [
      { href: "/attendance", label: "Daily roster", icon: ClipboardCheck },
      { href: "/attendance/schedules", label: "Schedules", icon: CalendarRange },
      { href: "/attendance/policies", label: "Policies", icon: Settings2 },
    ],
  },
  {
    label: "Leave",
    items: [
      { href: "/leave", label: "Requests", icon: CalendarDays },
      { href: "/leave/types", label: "Types", icon: Tags },
      { href: "/leave/policies", label: "Policies", icon: ScrollText },
      { href: "/leave/balances", label: "Balances", icon: Wallet },
    ],
  },
  {
    label: "Payroll",
    items: [
      { href: "/payroll", label: "Runs", icon: Banknote },
      { href: "/payroll/compensation", label: "Compensation", icon: Wallet },
      { href: "/payroll/schedules", label: "Schedules", icon: CalendarClock },
      { href: "/payroll/policies", label: "Policies", icon: ScrollText },
      { href: "/payroll/rule-versions", label: "Rule versions", icon: FileSpreadsheet },
    ],
  },
  {
    label: "Recruitment",
    items: [{ href: "/recruitment/tracking", label: "Application tracking", icon: KanbanSquare }],
  },
  {
    label: "Performance",
    items: [{ href: "/performance", label: "Review cycles", icon: Star }],
  },
  {
    label: "Cases",
    items: [{ href: "/cases", label: "Case monitoring", icon: Gavel }],
  },
  {
    label: "Events",
    items: [{ href: "/events", label: "Calendar", icon: CalendarDays }],
  },
  {
    label: "Settings",
    items: [
      { href: "/settings/catalogs", label: "Catalogs", icon: Settings },
      { href: "/settings/access", label: "Roles & access", icon: ShieldCheck },
      { href: "/settings/accounts", label: "Accounts", icon: UserCog },
      { href: "/settings/audit", label: "Audit log", icon: ScrollText },
    ],
  },
];

function slugify(href: string): string {
  return href.replace(/^\//, "").replace(/\//g, "-");
}

function sectionSlug(label: string): string {
  return label.toLowerCase().replace(/\s+/g, "-");
}

/**
 * The nav item a path belongs to: its own page or anything under it
 * (a payroll run under Runs, a profile under People). The longest match
 * wins, so /attendance/schedules is Schedules, not Daily roster.
 */
export function activeNavItem(pathname: string) {
  let best: { section: (typeof NAV_SECTIONS)[number]; item: (typeof NAV_SECTIONS)[number]["items"][number] } | null = null;
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      const matches = pathname === item.href || pathname.startsWith(`${item.href}/`);
      if (matches && (!best || item.href.length > best.item.href.length)) best = { section, item };
    }
  }
  return best;
}

const COLLAPSED_SECTIONS_STORAGE_KEY = "workforcehub:nav-collapsed-sections";

export function NavLinks({ onNavigate, collapsed = false }: { onNavigate?: () => void; collapsed?: boolean }) {
  const pathname = usePathname();
  const activeHref = activeNavItem(pathname)?.item.href;
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  // Per-viewer convenience only (which sections are collapsed) — never
  // read back by the server, safe to lose in private mode/cleared storage.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COLLAPSED_SECTIONS_STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of a per-viewer preference on mount, not a derived/external sync
      if (raw) setCollapsedSections(new Set(JSON.parse(raw) as string[]));
    } catch {
      // localStorage unavailable — sections just default to expanded.
    }
  }, []);

  function toggleSection(label: string) {
    setCollapsedSections((previous) => {
      const next = new Set(previous);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      try {
        window.localStorage.setItem(COLLAPSED_SECTIONS_STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // ignore — nothing to persist to
      }
      return next;
    });
  }

  return (
    <nav aria-label="Main navigation" className="flex flex-col gap-4">
      {NAV_SECTIONS.map((section, index) => {
        const hasActiveItem = section.items.some((item) => item.href === activeHref);
        // A section containing the current page always stays visible, even
        // if the viewer previously collapsed it — collapsing your own
        // active section re-expands it instead of hiding where you are.
        // The whole notion of a collapsed *section* only exists at full
        // width — on the icon rail every section always renders its items,
        // there's no header left to click to reveal them again.
        const isCollapsed = !collapsed && section.label ? collapsedSections.has(section.label) && !hasActiveItem : false;
        const slug = section.label ? sectionSlug(section.label) : `section-${index}`;

        return (
          <div
            key={section.label ?? `section-${index}`}
            className={cn("flex flex-col gap-1", collapsed && index > 0 && "border-t border-sidebar-border pt-3")}
          >
            {section.label && !collapsed && (
              <button
                type="button"
                onClick={() => toggleSection(section.label!)}
                aria-expanded={!isCollapsed}
                aria-controls={`nav-section-${slug}`}
                data-testid={`nav-section-toggle-${slug}`}
                className="flex items-center justify-between rounded-md px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase transition-colors hover:text-sidebar-foreground"
              >
                {section.label}
                <ChevronDown className={cn("size-3.5 transition-transform duration-150", isCollapsed && "-rotate-90")} />
              </button>
            )}
            {!isCollapsed && (
              <div id={`nav-section-${slug}`} className="flex flex-col gap-1">
                {section.items.map((item) => {
                  const isActive = item.href === activeHref;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={isActive ? "page" : undefined}
                      title={collapsed ? item.label : undefined}
                      data-testid={`nav-link-${slugify(item.href)}`}
                      className={cn(
                        "relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-[color,background-color,box-shadow] duration-150",
                        collapsed && "justify-center px-0",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-sidebar-primary"
                          : cn(
                              "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                              !collapsed && "hover:translate-x-0.5",
                            ),
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span className={cn(collapsed && "sr-only")}>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
