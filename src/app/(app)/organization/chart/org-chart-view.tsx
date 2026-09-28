"use client";

import { useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronDown, ChevronUp, ChevronsDownUp, ChevronsUpDown, Maximize2, Minus, Network, Plus, Rows3, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/status-badge";
import type { OrgChartNode } from "@/domains/workforce/org-chart-service";
import { collapsedBeyondDepth, findPath, flattenOrgChart, teamSize } from "@/domains/workforce/org-chart-summary";
import { cn } from "@/lib/utils";

const ZOOM_STEP = 0.1;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.5;
// Unit identity, in a fixed order by unit name (never by size), from the chart palette.
const UNIT_COLORS = ["var(--viz-series-1)", "var(--viz-series-2)", "var(--viz-series-3)", "var(--viz-series-4)", "var(--viz-series-5)"];
const NO_UNIT_COLOR = "var(--viz-ink-muted)";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

type ChartContext = {
  collapsed: Set<string>;
  toggle: (employeeId: string) => void;
  open: (employeeId: string) => void;
  colorOf: (unit: string | null) => string;
};

function NodeCard({ node, context }: { node: OrgChartNode; context: ChartContext }) {
  const reports = node.children.length;
  const isCollapsed = context.collapsed.has(node.employeeId);
  const showStatus = Boolean(node.employmentStatus) && node.employmentStatus !== "active";
  const color = context.colorOf(node.organizationUnitName);

  return (
    <div className="relative flex flex-col items-center">
      <div className="group/node relative w-56 overflow-hidden rounded-xl border bg-card text-left shadow-[var(--shadow-soft)] transition-[box-shadow,border-color,translate] duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[var(--shadow-raised)]">
        <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: color }} aria-hidden="true" />
        <div className="flex items-center gap-3 px-3 pt-4 pb-3">
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
            style={{ backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`, color }}
            aria-hidden="true"
          >
            {initials(node.name)}
          </span>
          <div className="flex min-w-0 flex-col">
            <button
              type="button"
              onClick={() => context.open(node.employeeId)}
              aria-label={`Open ${node.name}`}
              className="truncate text-left text-sm font-semibold after:absolute after:inset-0 after:rounded-xl hover:text-primary focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
            >
              {node.name}
            </button>
            <span className="truncate text-xs text-muted-foreground">{node.positionTitle ?? "No position"}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 border-t bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
          <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">{node.organizationUnitName ?? node.projectName ?? "No unit or project"}</span>
          {showStatus && <StatusBadge status={node.employmentStatus} className="px-1.5 py-0 text-[10px]" />}
          {reports > 0 && (
            <span className="flex shrink-0 items-center gap-1 font-medium tabular-nums" aria-label={`${reports} direct report${reports === 1 ? "" : "s"}`}>
              <Users className="size-3" aria-hidden="true" />
              {reports}
            </span>
          )}
        </div>
      </div>
      {reports > 0 && (
        <button
          type="button"
          onClick={() => context.toggle(node.employeeId)}
          aria-label={isCollapsed ? `Show ${node.name}'s team (${teamSize(node)})` : `Hide ${node.name}'s team`}
          aria-expanded={!isCollapsed}
          className={cn(
            "relative z-10 -mt-3 flex h-6 items-center gap-1 rounded-full border bg-card px-2 text-[11px] font-medium text-muted-foreground shadow-[var(--shadow-soft)] transition-colors hover:border-primary/40 hover:text-primary",
            isCollapsed && "border-primary/40 text-primary",
          )}
        >
          {isCollapsed ? (
            <>
              <span className="tabular-nums">{teamSize(node)}</span>
              <ChevronDown className="size-3" aria-hidden="true" />
            </>
          ) : (
            <ChevronUp className="size-3" aria-hidden="true" />
          )}
        </button>
      )}
    </div>
  );
}

function Children({ node, context }: { node: OrgChartNode; context: ChartContext }) {
  if (node.children.length === 0 || context.collapsed.has(node.employeeId)) return null;
  return (
    <ul role="group" className="relative flex pt-6 before:absolute before:top-0 before:left-1/2 before:h-6 before:w-px before:-translate-x-1/2 before:bg-border">
      {node.children.map((child) => (
        <Branch key={child.employeeId} node={child} context={context} child />
      ))}
    </ul>
  );
}

/** One person and their team; non-root branches draw the connectors up to their manager and across to their siblings. */
function Branch({ node, context, child = false }: { node: OrgChartNode; context: ChartContext; child?: boolean }) {
  return (
    <li
      role="treeitem"
      aria-expanded={node.children.length > 0 ? !context.collapsed.has(node.employeeId) : undefined}
      aria-selected={false}
      className={cn(
        "relative flex flex-col items-center px-3",
        child &&
          "pt-6 before:absolute before:top-0 before:right-1/2 before:h-6 before:w-1/2 before:border-t before:border-r before:border-border after:absolute after:top-0 after:left-1/2 after:h-6 after:w-1/2 after:border-t after:border-l after:border-border first:before:border-t-transparent last:after:border-t-transparent only:before:border-transparent only:after:border-t-transparent first:before:rounded-tr-none last:after:rounded-tl-none",
      )}
    >
      <NodeCard node={node} context={context} />
      <Children node={node} context={context} />
    </li>
  );
}

function PersonSheet({ roots, employeeId, onClose, colorOf }: { roots: OrgChartNode[]; employeeId: string | null; onClose: () => void; colorOf: (unit: string | null) => string }) {
  const path = employeeId ? findPath(roots, employeeId) : null;
  const person = path?.at(-1) ?? null;
  const managers = path ? path.slice(0, -1).reverse() : [];

  return (
    <Sheet open={person !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
        {person && (
          <>
            <SheetHeader className="border-b">
              <div className="flex items-center gap-3 pr-8">
                <span
                  className="flex size-12 shrink-0 items-center justify-center rounded-full text-base font-semibold"
                  style={{ backgroundColor: `color-mix(in oklab, ${colorOf(person.organizationUnitName)} 14%, transparent)`, color: colorOf(person.organizationUnitName) }}
                  aria-hidden="true"
                >
                  {initials(person.name)}
                </span>
                <div className="min-w-0">
                  <SheetTitle className="truncate">{person.name}</SheetTitle>
                  <SheetDescription className="truncate">{person.positionTitle ?? "No position"}</SheetDescription>
                </div>
              </div>
            </SheetHeader>
            <div className="flex flex-col gap-5 p-4">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Unit</dt>
                  <dd>{person.organizationUnitName ?? "None"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Project</dt>
                  <dd>{person.projectName ?? "None"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Direct reports</dt>
                  <dd className="tabular-nums">{person.children.length}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Whole team</dt>
                  <dd className="tabular-nums">{teamSize(person)}</dd>
                </div>
              </dl>

              <section className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Reports to</h3>
                {managers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No manager on the chart.</p>
                ) : (
                  <ol className="flex flex-col gap-1">
                    {managers.map((manager, index) => (
                      <li key={manager.employeeId}>
                        <Link href={`/people/${manager.employeeId}`} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                          <span className="w-12 shrink-0 text-xs text-muted-foreground">{index === 0 ? "Manager" : `Level ${index + 1}`}</span>
                          <span className="min-w-0 flex-1 truncate font-medium">{manager.name}</span>
                          <span className="truncate text-xs text-muted-foreground">{manager.positionTitle}</span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              {person.children.length > 0 && (
                <section className="flex flex-col gap-2">
                  <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Direct reports</h3>
                  <ul className="flex flex-col gap-1">
                    {person.children.map((report) => (
                      <li key={report.employeeId}>
                        <Link href={`/people/${report.employeeId}`} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                          <span className="min-w-0 flex-1 truncate font-medium">{report.name}</span>
                          <span className="truncate text-xs text-muted-foreground">{report.positionTitle}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <Link href={`/people/${person.employeeId}`} className="flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted">
                View full profile
                <ArrowUpRight className="size-3.5" aria-hidden="true" />
              </Link>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * The org chart workspace: a zoomable, draggable canvas of cards (or the
 * same people as an indented list), teams that fold away, and a side panel
 * per person. Large charts open with only the top two levels unfolded.
 */
export function OrgChartView({ roots }: { roots: OrgChartNode[] }) {
  const rows = useMemo(() => flattenOrgChart(roots), [roots]);
  const [view, setView] = useState<"chart" | "list">("chart");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => (rows.length > 40 ? collapsedBeyondDepth(roots, 2) : new Set()));
  const [zoom, setZoom] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  const units = useMemo(() => [...new Set(rows.map((row) => row.node.organizationUnitName).filter((unit): unit is string => Boolean(unit)))].sort((a, b) => a.localeCompare(b)), [rows]);
  const colorOf = (unit: string | null) => {
    // With no units set up anywhere, color would carry no meaning: use the brand blue throughout.
    if (units.length === 0) return "var(--primary)";
    const index = unit ? units.indexOf(unit) : -1;
    return index >= 0 && index < UNIT_COLORS.length ? UNIT_COLORS[index] : NO_UNIT_COLOR;
  };

  const context: ChartContext = {
    collapsed,
    colorOf,
    open: setOpenId,
    toggle: (employeeId) =>
      setCollapsed((current) => {
        const next = new Set(current);
        if (next.has(employeeId)) next.delete(employeeId);
        else next.add(employeeId);
        return next;
      }),
  };

  const setZoomClamped = (value: number) => setZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value * 10) / 10)));

  // Drag the empty canvas to pan; cards and buttons keep their own clicks.
  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button, a") || !canvasRef.current) return;
    drag.current = { x: event.clientX, y: event.clientY, left: canvasRef.current.scrollLeft, top: canvasRef.current.scrollTop };
    canvasRef.current.setPointerCapture?.(event.pointerId);
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current || !canvasRef.current) return;
    canvasRef.current.scrollLeft = drag.current.left - (event.clientX - drag.current.x);
    canvasRef.current.scrollTop = drag.current.top - (event.clientY - drag.current.y);
  }

  if (roots.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-card p-12 text-center">
        <Network className="size-8 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-medium">No one matches these filters</p>
        <p className="text-sm text-muted-foreground">Clear a filter, or assign managers on employee profiles to build the chart.</p>
      </div>
    );
  }

  const zoomLabel = `${Math.round(zoom * 100)}%`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="View" className="flex rounded-lg border bg-muted/40 p-0.5">
          {(
            [
              ["chart", "Chart", Network],
              ["list", "List", Rows3],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={view === value}
              onClick={() => setView(value)}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-muted-foreground transition-[color,background-color,box-shadow] duration-150 hover:text-foreground",
                view === value && "bg-background text-foreground shadow-[var(--shadow-soft)]",
              )}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        {view === "chart" && (
          <>
            <div className="flex gap-1">
              <Button type="button" variant="outline" size="sm" onClick={() => setCollapsed(new Set())}>
                <ChevronsUpDown className="size-3.5" aria-hidden="true" />
                Expand all
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setCollapsed(collapsedBeyondDepth(roots, 0))}>
                <ChevronsDownUp className="size-3.5" aria-hidden="true" />
                Collapse all
              </Button>
            </div>
            <div className="ml-auto flex items-center rounded-lg border bg-card shadow-[var(--shadow-soft)]">
              <button type="button" onClick={() => setZoomClamped(zoom - ZOOM_STEP)} disabled={zoom <= ZOOM_MIN} aria-label="Zoom out" className="flex size-8 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40">
                <Minus className="size-3.5" />
              </button>
              <span className="w-12 text-center text-xs font-medium tabular-nums" aria-live="polite">
                {zoomLabel}
              </span>
              <button type="button" onClick={() => setZoomClamped(zoom + ZOOM_STEP)} disabled={zoom >= ZOOM_MAX} aria-label="Zoom in" className="flex size-8 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40">
                <Plus className="size-3.5" />
              </button>
              <span className="h-4 w-px bg-border" aria-hidden="true" />
              <button type="button" onClick={() => setZoom(1)} aria-label="Reset zoom" className="flex size-8 items-center justify-center text-muted-foreground hover:text-foreground">
                <Maximize2 className="size-3.5" />
              </button>
            </div>
          </>
        )}
      </div>

      {view === "chart" ? (
        <>
          <div
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
            className="relative h-[min(70dvh,44rem)] cursor-grab overflow-auto rounded-xl border bg-card shadow-[var(--shadow-soft)] active:cursor-grabbing"
            style={{
              backgroundImage: "radial-gradient(color-mix(in oklab, var(--foreground) 12%, transparent) 1px, transparent 1.2px)",
              backgroundSize: "18px 18px",
            }}
          >
            <div className="w-fit min-w-full p-10" style={{ zoom } as CSSProperties}>
              <ul role="tree" aria-label="Organization chart" className="flex w-fit min-w-full justify-center">
                {roots.map((root) => (
                  <Branch key={root.employeeId} node={root} context={context} />
                ))}
              </ul>
            </div>
          </div>
          {units.length > 0 && (
            <ul aria-label="Units" className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
              {units.map((unit) => (
                <li key={unit} className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm" style={{ backgroundColor: colorOf(unit) }} aria-hidden="true" />
                  {unit}
                </li>
              ))}
              <li className="ml-auto hidden sm:block">Drag the canvas to move around · Click a card for details</li>
            </ul>
          )}
        </>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-soft)]">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                {["Person", "Position", "Unit", "Reports to", "Direct reports", "Whole team"].map((header) => (
                  <TableHead key={header} className="px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ node, depth, managerName }) => (
                <TableRow key={node.employeeId}>
                  <TableCell className="px-3">
                    <div className="flex items-center gap-2" style={{ paddingLeft: `${depth * 1.25}rem` }}>
                      {depth > 0 && <span className="h-px w-2.5 bg-border" aria-hidden="true" />}
                      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: colorOf(node.organizationUnitName) }} aria-hidden="true" />
                      <button type="button" onClick={() => setOpenId(node.employeeId)} className="truncate font-medium hover:text-primary">
                        {node.name}
                      </button>
                    </div>
                  </TableCell>
                  <TableCell className="px-3">{node.positionTitle ?? "—"}</TableCell>
                  <TableCell className="px-3">{node.organizationUnitName ?? "—"}</TableCell>
                  <TableCell className="px-3 text-muted-foreground">{managerName ?? "—"}</TableCell>
                  <TableCell className="px-3 tabular-nums">{node.children.length}</TableCell>
                  <TableCell className="px-3 tabular-nums">{teamSize(node)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <PersonSheet roots={roots} employeeId={openId} onClose={() => setOpenId(null)} colorOf={colorOf} />
    </div>
  );
}
