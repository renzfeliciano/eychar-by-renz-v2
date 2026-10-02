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
  Calculator,
  Trash2,
  LockKeyhole,
  type LucideIcon,
} from "lucide-react";
import { BRAND } from "@/lib/brand";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown only to holders of this permission — the same key the page itself checks. */
  permission?: string;
  /** Shown to holders of any one of these (a page that renders whichever sections you can read). */
  anyPermission?: readonly string[];
  /** Shown only to the organization's Super Administrator. */
  superAdminOnly?: boolean;
  /**
   * A merged module: one sidebar link whose screens are tabs at the top of
   * each page (ModuleTabs). The link opens the first tab the viewer can see,
   * and is shown when they can see any of them.
   */
  tabs?: NavItem[];
};

export type NavSection = { label: string | null; items: NavItem[]; /** Starts collapsed until the viewer opens it. */ defaultCollapsed?: boolean };

/**
 * The read permissions behind the Catalogs page's sections (see
 * CATALOG_REGISTRY's permissionPrefix) — it opens if you can read any one.
 */
export const CATALOG_READ_PERMISSIONS = [
  "employment-types.read",
  "employment-statuses.read",
  "attendance-statuses.read",
  "recruitment-stages.read",
  "event-categories.read",
  "case-classifications.read",
  "case-statuses.read",
  "performance-ratings.read",
  "document-types.read",
  "clearance-departments.read",
  "separation-types.read",
  "payment-methods.read",
] as const;

/**
 * Every item carries the permission its page checks, so the menu only lists
 * what the viewer can open. This is a usability filter (AGENTS.md §23): each
 * page still checks the permission server-side and shows NoAccessState.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Work",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      {
        href: "/attendance",
        label: "Attendance",
        icon: ClipboardCheck,
        tabs: [
          { href: "/attendance", label: "Daily roster", icon: ClipboardCheck, permission: "attendance.read" },
          { href: "/attendance/schedules", label: "Schedules", icon: CalendarRange, permission: "attendance.read" },
        ],
      },
      {
        href: "/leave",
        label: "Leave",
        icon: CalendarDays,
        tabs: [
          { href: "/leave", label: "Requests", icon: CalendarDays, permission: "leave.read" },
          { href: "/leave/balances", label: "Balances", icon: Wallet, permission: "leave-balances.read" },
        ],
      },
      {
        href: "/payroll",
        label: "Payroll",
        icon: Banknote,
        tabs: [
          { href: "/payroll", label: "Runs", icon: Banknote, permission: "payroll-runs.read" },
          { href: "/payroll/compensation", label: "Compensation", icon: Wallet, permission: "compensation.read" },
        ],
      },
      {
        href: "/clearance",
        label: "Offboarding",
        icon: UserMinus,
        tabs: [
          { href: "/clearance", label: "Clearance", icon: UserMinus, permission: "clearance.read" },
          { href: "/final-settlements", label: "Final settlement", icon: Calculator, permission: "final-settlements.read" },
        ],
      },
    ],
  },
  {
    label: "Organization",
    items: [
      { href: "/people", label: "People", icon: Users, permission: "employees.read" },
      { href: "/organization/projects", label: "Projects", icon: FolderKanban, permission: "projects.read" },
      { href: "/organization/chart", label: "Chart", icon: Network, permission: "employees.read" },
    ],
  },
  {
    label: "More",
    defaultCollapsed: true,
    items: [
      { href: "/travel-orders", label: "Travel orders", icon: Plane, permission: "travel-orders.read" },
      { href: "/recruitment/tracking", label: "Recruitment", icon: KanbanSquare, permission: "applicants.read" },
      { href: "/performance", label: "Performance", icon: Star, permission: "review-cycles.read" },
      { href: "/cases", label: "Cases", icon: Gavel, permission: "cases.read" },
      { href: "/events", label: "Events", icon: CalendarDays, permission: "events.read" },
      {
        href: "/organization/units",
        label: "Setup",
        icon: Settings2,
        tabs: [
          { href: "/organization/units", label: "Units", icon: Building2, permission: "organization-units.read" },
          { href: "/organization/positions", label: "Positions", icon: Briefcase, permission: "positions.read" },
          { href: "/organization/locations", label: "Locations", icon: MapPin, permission: "locations.read" },
          { href: "/settings/catalogs", label: "Catalogs", icon: Settings, anyPermission: CATALOG_READ_PERMISSIONS },
          { href: "/leave/types", label: "Leave types", icon: Tags, permission: "leave-types.read" },
          { href: "/leave/policies", label: "Leave policies", icon: ScrollText, permission: "leave-policies.read" },
          { href: "/attendance/policies", label: "Attendance policies", icon: Settings2, permission: "attendance-policies.read" },
          { href: "/payroll/policies", label: "Payroll policies", icon: ScrollText, permission: "payroll-policies.read" },
          { href: "/payroll/schedules", label: "Payroll schedules", icon: CalendarClock, permission: "payroll-schedules.read" },
          { href: "/payroll/rule-versions", label: "Rule versions", icon: FileSpreadsheet, permission: "payroll-rule-versions.read" },
        ],
      },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/settings/access", label: "Roles & access", icon: ShieldCheck, permission: "roles.read" },
      { href: "/settings/accounts", label: "Accounts", icon: UserCog, permission: "users.read" },
      { href: "/settings/audit", label: "Audit log", icon: ScrollText, permission: "audit-logs.read" },
      { href: "/settings/security", label: "Security", icon: LockKeyhole, superAdminOnly: true },
      { href: "/settings/recycle-bin", label: "Recycle bin", icon: Trash2, superAdminOnly: true },
    ],
  },
];

/** Every page reachable from the sidebar: plain links and each merged module's tabs. */
export const NAV_PAGES: NavItem[] = NAV_SECTIONS.flatMap((section) => section.items.flatMap((item) => item.tabs ?? [item]));

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
  let best: { section: NavSection; item: NavItem; tab?: NavItem; matched: string } | null = null;
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      for (const page of item.tabs ?? [item]) {
        const matches = pathname === page.href || pathname.startsWith(`${page.href}/`);
        if (matches && (!best || page.href.length > best.matched.length)) best = { section, item, tab: item.tabs ? page : undefined, matched: page.href };
      }
    }
  }
  return best;
}

// v2: the menu was regrouped (Work · Organization · More · Admin), so old saved choices no longer apply.
const COLLAPSED_SECTIONS_STORAGE_KEY = `${BRAND.storagePrefix}:nav-collapsed-sections-v2`;

/**
 * Whether the viewer sees this nav item. `heldPermissions` undefined means
 * "not known" (nothing filtered but Super-Administrator-only items).
 */
export function canSeeNavItem(item: NavItem, { isSuperAdmin = false, heldPermissions }: { isSuperAdmin?: boolean; heldPermissions?: readonly string[] }): boolean {
  if (item.tabs) return item.tabs.some((tab) => canSeeNavItem(tab, { isSuperAdmin, heldPermissions }));
  if (isSuperAdmin) return true;
  if (item.superAdminOnly) return false;
  if (!heldPermissions) return true;
  if (item.permission && !heldPermissions.includes(item.permission)) return false;
  if (item.anyPermission && !item.anyPermission.some((key) => heldPermissions.includes(key))) return false;
  return true;
}

/** A merged module's tabs the viewer may open, in order. */
export function visibleTabs(item: NavItem, viewer: { isSuperAdmin?: boolean; heldPermissions?: readonly string[] }): NavItem[] {
  return (item.tabs ?? [item]).filter((tab) => canSeeNavItem(tab, viewer));
}

export function NavLinks({
  onNavigate,
  collapsed = false,
  isSuperAdmin = false,
  heldPermissions,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
  isSuperAdmin?: boolean;
  /** The viewer's permission keys in the current organization (from the server). */
  heldPermissions?: readonly string[];
}) {
  const viewer = { isSuperAdmin, heldPermissions };
  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items
      .filter((item) => canSeeNavItem(item, viewer))
      // A merged module opens the first of its screens the viewer can see.
      .map((item) => (item.tabs ? { ...item, href: visibleTabs(item, viewer)[0].href } : item)),
  })).filter((section) => section.items.length > 0);
  const pathname = usePathname();
  const active = activeNavItem(pathname);
  const activeLabel = active?.item.label;
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => new Set(NAV_SECTIONS.filter((section) => section.defaultCollapsed && section.label).map((section) => section.label!)));

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
      {sections.map((section, index) => {
        const hasActiveItem = section.items.some((item) => item.label === activeLabel && active?.section.label === section.label);
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
            className={cn("flex flex-col gap-0.5", collapsed && index > 0 && "border-t border-sidebar-border pt-3")}
          >
            {section.label && !collapsed && (
              <button
                type="button"
                onClick={() => toggleSection(section.label!)}
                aria-expanded={!isCollapsed}
                aria-controls={`nav-section-${slug}`}
                data-testid={`nav-section-toggle-${slug}`}
                className="group mb-0.5 flex h-7 cursor-pointer max-md:h-9 items-center justify-between rounded-md px-2.5 text-[11px] font-semibold tracking-[0.07em] text-muted-foreground/90 uppercase transition-colors duration-150 hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none"
              >
                {section.label}
                <ChevronDown
                  className={cn(
                    "size-3.5 opacity-50 transition-[transform,opacity] duration-150 group-hover:opacity-100 group-focus-visible:opacity-100",
                    isCollapsed && "-rotate-90 opacity-80",
                  )}
                  aria-hidden="true"
                />
              </button>
            )}
            {!isCollapsed && (
              <div id={`nav-section-${slug}`} className="flex flex-col gap-0.5">
                {section.items.map((item) => {
                  const isActive = item.label === activeLabel && active?.section.label === section.label;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={isActive ? "page" : undefined}
                      title={collapsed ? item.label : undefined}
                      data-testid={`nav-link-${item.tabs ? sectionSlug(item.label) : slugify(item.href)}`}
                      className={cn(
                        "group/nav relative flex h-[34px] items-center max-md:h-10 gap-3 rounded-md px-2.5 text-[13.5px] transition-[color,background-color] duration-150 focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none",
                        collapsed && "h-9 justify-center px-0",
                        isActive
                          ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r-full before:bg-sidebar-primary"
                          : "font-medium text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                      )}
                    >
                      <Icon
                        className={cn(
                          "size-4 shrink-0 transition-colors duration-150",
                          isActive ? "text-sidebar-primary" : "text-sidebar-foreground/55 group-hover/nav:text-sidebar-foreground/80",
                        )}
                        strokeWidth={isActive ? 2 : 1.75}
                        aria-hidden="true"
                      />
                      <span className={cn("truncate", collapsed && "sr-only")}>{item.label}</span>
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
