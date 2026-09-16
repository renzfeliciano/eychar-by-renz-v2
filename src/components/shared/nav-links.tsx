"use client";

// data-testid convention used across this app: "<feature>-<element>-<action?>",
// kebab-case (e.g. "payroll-generate-run-button", "leave-types-create-button").
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  Settings2,
  CalendarDays,
  Tags,
  ScrollText,
  Wallet,
  Banknote,
  FileSpreadsheet,
  Settings,
  KanbanSquare,
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
    items: [{ href: "/people", label: "People", icon: Users }],
  },
  {
    label: "Attendance",
    items: [
      { href: "/attendance", label: "Daily roster", icon: ClipboardCheck },
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
      { href: "/payroll/policies", label: "Policies", icon: ScrollText },
      { href: "/payroll/rule-versions", label: "Rule versions", icon: FileSpreadsheet },
      { href: "/payroll/compensation", label: "Compensation", icon: Wallet },
    ],
  },
  {
    label: "Recruitment",
    items: [
      { href: "/recruitment", label: "Job openings", icon: Briefcase },
      { href: "/recruitment/tracking", label: "Application tracking", icon: KanbanSquare },
    ],
  },
  {
    label: "Settings",
    items: [{ href: "/settings/catalogs", label: "Catalogs", icon: Settings }],
  },
];

function slugify(href: string): string {
  return href.replace(/^\//, "").replace(/\//g, "-");
}

export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main navigation" className="flex flex-col gap-4">
      {NAV_SECTIONS.map((section, index) => (
        <div key={section.label ?? `section-${index}`} className="flex flex-col gap-1">
          {section.label && (
            <p className="px-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {section.label}
            </p>
          )}
          {section.items.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={isActive ? "page" : undefined}
                data-testid={`nav-link-${slugify(item.href)}`}
                className={cn(
                  "relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-all duration-150",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-sidebar-primary"
                    : "text-sidebar-foreground/70 hover:translate-x-0.5 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
