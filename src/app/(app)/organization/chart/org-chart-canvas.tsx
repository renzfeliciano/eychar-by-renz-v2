"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Boxes,
  ExternalLink,
  Link2Off,
  Maximize2,
  Minus,
  Network,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
  UserPlus,
  Users,
  Wand2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ORG_CHART_COLORS } from "@/shared/validation/org-chart";
import { CARD_HEIGHT, CARD_WIDTH, arrange, canLink, link, type ChartEdge, type ChartNode } from "@/domains/workforce/org-chart-tree";
import type { OrgChartView, ChartPerson } from "@/domains/workforce/org-chart-service";

type Color = (typeof ORG_CHART_COLORS)[number];
const COLOR: Record<Color, { bar: string; soft: string; avatar: string; swatch: string }> = {
  // "blue" is the brand navy, so an uncolored chart reads as part of the app.
  blue: { bar: "bg-primary", soft: "bg-primary/[0.04]", avatar: "bg-secondary text-secondary-foreground ring-1 ring-border", swatch: "bg-primary" },
  violet: { bar: "bg-violet-500", soft: "bg-violet-500/8", avatar: "bg-violet-500/15 text-violet-700 dark:text-violet-300", swatch: "bg-violet-500" },
  teal: { bar: "bg-teal-500", soft: "bg-teal-500/8", avatar: "bg-teal-500/15 text-teal-700 dark:text-teal-300", swatch: "bg-teal-500" },
  emerald: { bar: "bg-emerald-500", soft: "bg-emerald-500/8", avatar: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", swatch: "bg-emerald-500" },
  amber: { bar: "bg-amber-500", soft: "bg-amber-500/10", avatar: "bg-amber-500/15 text-amber-800 dark:text-amber-300", swatch: "bg-amber-500" },
  rose: { bar: "bg-rose-500", soft: "bg-rose-500/8", avatar: "bg-rose-500/15 text-rose-700 dark:text-rose-300", swatch: "bg-rose-500" },
  slate: { bar: "bg-slate-400", soft: "bg-slate-500/8", avatar: "bg-slate-500/15 text-slate-700 dark:text-slate-300", swatch: "bg-slate-400" },
};
const colorOf = (node: ChartNode): Color => (ORG_CHART_COLORS as readonly string[]).includes(node.color ?? "") ? (node.color as Color) : node.type === "group" ? "violet" : "blue";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

const newKey = () => `n-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;

type View = { x: number; y: number; zoom: number };
type Drag =
  | { kind: "pan"; startX: number; startY: number; view: View }
  | { kind: "move"; key: string; offsetX: number; offsetY: number; moved: boolean }
  | { kind: "link"; from: string; x: number; y: number };

/**
 * The org chart as a free canvas (ADR-046). Cards are employees or named
 * group boxes; a line runs from each card to the one it sits under. Drag a
 * card's bottom dot onto another card to put that card under it. Nothing is
 * stored until "Save chart".
 */
export function OrgChartCanvas({ organizationId, initial, canEdit }: { organizationId: string; initial: OrgChartView; canEdit: boolean }) {
  const router = useRouter();
  const frameRef = useRef<HTMLDivElement>(null);
  const [nodes, setNodes] = useState<ChartNode[]>(initial.nodes);
  const [edges, setEdges] = useState<ChartEdge[]>(initial.edges);
  const [view, setView] = useState<View>({ x: 40, y: 40, zoom: 1 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [linkTarget, setLinkTarget] = useState<string | null>(null);
  const [dirty, setDirty] = useState(!initial.saved && initial.nodes.length > 0);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");

  const people = useMemo(() => new Map(initial.people.map((person) => [person.employeeId, person])), [initial.people]);
  const byKey = useMemo(() => new Map(nodes.map((node) => [node.key, node])), [nodes]);
  const onChart = useMemo(() => new Set(nodes.flatMap((node) => (node.employeeId ? [node.employeeId] : []))), [nodes]);
  const childCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const edge of edges) counts.set(edge.from, (counts.get(edge.from) ?? 0) + 1);
    return counts;
  }, [edges]);
  const available = initial.people.filter((person) => !onChart.has(person.employeeId) && (!query.trim() || `${person.name} ${person.positionTitle ?? ""} ${person.employeeNumber ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())));

  const change = (next: { nodes?: ChartNode[]; edges?: ChartEdge[] }) => {
    if (next.nodes) setNodes(next.nodes);
    if (next.edges) setEdges(next.edges);
    setDirty(true);
  };

  // ── Coordinates ──────────────────────────────────────────────────────
  const toWorld = useCallback(
    (clientX: number, clientY: number) => {
      const rect = frameRef.current!.getBoundingClientRect();
      return { x: (clientX - rect.left - view.x) / view.zoom, y: (clientY - rect.top - view.y) / view.zoom };
    },
    [view],
  );
  const centerOfView = () => {
    const rect = frameRef.current!.getBoundingClientRect();
    return { x: (rect.width / 2 - view.x) / view.zoom - CARD_WIDTH / 2, y: (rect.height / 2 - view.y) / view.zoom - CARD_HEIGHT / 2 };
  };

  const fit = useCallback(
    (list: ChartNode[] = nodes) => {
      const frame = frameRef.current;
      if (!frame || list.length === 0) return;
      const minX = Math.min(...list.map((node) => node.x));
      const minY = Math.min(...list.map((node) => node.y));
      const maxX = Math.max(...list.map((node) => node.x + CARD_WIDTH));
      const maxY = Math.max(...list.map((node) => node.y + CARD_HEIGHT));
      const pad = 40;
      const zoom = Math.min(1.25, Math.max(0.25, Math.min((frame.clientWidth - pad * 2) / (maxX - minX), (frame.clientHeight - pad * 2) / (maxY - minY))));
      setView({ zoom, x: (frame.clientWidth - (maxX - minX) * zoom) / 2 - minX * zoom, y: pad - minY * zoom });
    },
    [nodes],
  );

  // Fit once on first paint.
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current) return;
    fitted.current = true;
    fit(initial.nodes);
  }, [fit, initial.nodes]);

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // ── Pointer handling ─────────────────────────────────────────────────
  function onFramePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    setSelected(null);
    setSelectedEdge(null);
    frameRef.current?.setPointerCapture(event.pointerId);
    setDrag({ kind: "pan", startX: event.clientX, startY: event.clientY, view });
  }

  function onCardPointerDown(event: ReactPointerEvent<HTMLDivElement>, node: ChartNode) {
    event.stopPropagation();
    if (event.button !== 0) return;
    setSelected(node.key);
    setSelectedEdge(null);
    if (!canEdit) return;
    const point = toWorld(event.clientX, event.clientY);
    frameRef.current?.setPointerCapture(event.pointerId);
    setDrag({ kind: "move", key: node.key, offsetX: point.x - node.x, offsetY: point.y - node.y, moved: false });
  }

  function onHandlePointerDown(event: ReactPointerEvent<HTMLButtonElement>, node: ChartNode) {
    event.stopPropagation();
    if (!canEdit) return;
    const point = toWorld(event.clientX, event.clientY);
    frameRef.current?.setPointerCapture(event.pointerId);
    setDrag({ kind: "link", from: node.key, x: point.x, y: point.y });
  }

  function cardUnder(clientX: number, clientY: number): string | null {
    const element = document.elementsFromPoint(clientX, clientY).find((item) => item instanceof HTMLElement && item.dataset.nodeKey);
    return (element as HTMLElement | undefined)?.dataset.nodeKey ?? null;
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag) return;
    if (drag.kind === "pan") {
      setView({ ...drag.view, x: drag.view.x + event.clientX - drag.startX, y: drag.view.y + event.clientY - drag.startY });
    } else if (drag.kind === "move") {
      const point = toWorld(event.clientX, event.clientY);
      setNodes((current) => current.map((node) => (node.key === drag.key ? { ...node, x: Math.round(point.x - drag.offsetX), y: Math.round(point.y - drag.offsetY) } : node)));
      if (!drag.moved) setDrag({ ...drag, moved: true });
    } else {
      const point = toWorld(event.clientX, event.clientY);
      setDrag({ ...drag, x: point.x, y: point.y });
      const target = cardUnder(event.clientX, event.clientY);
      setLinkTarget(target && target !== drag.from ? target : null);
    }
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (drag?.kind === "move" && drag.moved) setDirty(true);
    if (drag?.kind === "link") {
      const target = cardUnder(event.clientX, event.clientY);
      if (target && target !== drag.from) {
        // Dragged FROM a person, dropped ON another: the first reports to the second.
        const child = byKey.get(drag.from)!;
        const parent = byKey.get(target)!;
        if (canLink(edges, parent.key, child.key)) {
          const nextEdges = link(edges, parent.key, child.key);
          relayout(nodes, nextEdges);
          toast.success(`${labelOf(child)} now reports to ${labelOf(parent)}`);
        } else {
          toast.error(`${labelOf(parent)} already reports up to ${labelOf(child)}, so that would make a loop.`);
        }
      }
      setLinkTarget(null);
    }
    setDrag(null);
  }

  function onWheel(event: React.WheelEvent<HTMLDivElement>) {
    const rect = frameRef.current!.getBoundingClientRect();
    const zoom = Math.min(2, Math.max(0.2, view.zoom * (event.deltaY < 0 ? 1.1 : 0.9)));
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    setView({ zoom, x: px - ((px - view.x) / view.zoom) * zoom, y: py - ((py - view.y) / view.zoom) * zoom });
  }

  const zoomBy = (factor: number) => {
    const frame = frameRef.current!;
    const zoom = Math.min(2, Math.max(0.2, view.zoom * factor));
    const px = frame.clientWidth / 2;
    const py = frame.clientHeight / 2;
    setView({ zoom, x: px - ((px - view.x) / view.zoom) * zoom, y: py - ((py - view.y) / view.zoom) * zoom });
  };

  // ── Edits ────────────────────────────────────────────────────────────
  function labelOf(node: ChartNode): string {
    return node.type === "group" ? (node.label ?? "Group") : (people.get(node.employeeId ?? "")?.name ?? "Employee");
  }
  function addPerson(person: ChartPerson) {
    const at = centerOfView();
    const node: ChartNode = { key: newKey(), type: "person", employeeId: person.employeeId, x: Math.round(at.x), y: Math.round(at.y) };
    change({ nodes: [...nodes, node] });
    setSelected(node.key);
  }
  function addGroup() {
    const at = centerOfView();
    const node: ChartNode = { key: newKey(), type: "group", label: "New group", color: "violet", x: Math.round(at.x), y: Math.round(at.y) };
    change({ nodes: [...nodes, node] });
    setSelected(node.key);
  }
  function removeCard(key: string) {
    relayout(nodes.filter((node) => node.key !== key), edges.filter((edge) => edge.from !== key && edge.to !== key));
    setSelected(null);
  }
  function unlink(childKey: string) {
    relayout(nodes, edges.filter((edge) => edge.to !== childKey));
    setSelectedEdge(null);
  }
  /** Every link change snaps the chart back into a tidy tree. */
  function relayout(nextNodes: ChartNode[], nextEdges: ChartEdge[]) {
    const arranged = arrange(nextNodes, nextEdges);
    change({ nodes: arranged, edges: nextEdges });
    requestAnimationFrame(() => fit(arranged));
  }
  function update(key: string, patch: Partial<ChartNode>) {
    change({ nodes: nodes.map((node) => (node.key === key ? { ...node, ...patch } : node)) });
  }
  function autoArrange() {
    const next = arrange(nodes, edges);
    change({ nodes: next });
    requestAnimationFrame(() => fit(next));
  }
  function discard() {
    setNodes(initial.nodes);
    setEdges(initial.edges);
    setDirty(false);
    setSelected(null);
    requestAnimationFrame(() => fit(initial.nodes));
  }

  async function save() {
    setSaving(true);
    const response = await fetch("/api/organization-chart", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, nodes: nodes.map(({ key, type, employeeId, label, color, x, y }) => ({ key, type, employeeId, label, color, x, y })), edges }),
    });
    const body = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      toast.error(body.error ?? "Couldn't save the chart.");
      return;
    }
    setDirty(false);
    toast.success("Chart saved");
    router.refresh();
  }

  // Delete removes the selected card or line; Escape clears the selection.
  useEffect(() => {
    if (!canEdit) return;
    const onKey = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLElement && (event.target.tagName === "INPUT" || event.target.isContentEditable);
      if (typing) return;
      if ((event.key === "Delete" || event.key === "Backspace") && selected) removeCard(selected);
      else if ((event.key === "Delete" || event.key === "Backspace") && selectedEdge) unlink(selectedEdge);
      else if (event.key === "Escape") {
        setSelected(null);
        setSelectedEdge(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const selectedNode = selected ? byKey.get(selected) : undefined;
  const unlinkChild = canEdit && selectedEdge ? byKey.get(selectedEdge) : undefined;
  const unlinkAt = unlinkChild && edges.some((edge) => edge.to === unlinkChild.key) ? { child: unlinkChild.key, x: unlinkChild.x + CARD_WIDTH / 2, y: unlinkChild.y - 14 } : null;
  const linkFrom = drag?.kind === "link" ? byKey.get(drag.from) : undefined;

  return (
    <div className="flex flex-col gap-3 lg:flex-row" data-testid="org-chart-canvas">
      {canEdit && (
        <aside className="flex flex-col gap-3 rounded-lg border bg-card p-3 shadow-[var(--shadow-soft)] lg:w-64 lg:shrink-0" aria-label="People to add">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Users className="size-4 text-muted-foreground" aria-hidden="true" />
            People
            <span className="font-normal text-muted-foreground">({available.length} not on the chart)</span>
          </p>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find someone" aria-label="Find someone to add" className="pl-8" />
          </div>
          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto lg:max-h-[28rem]">
            {available.length === 0 && <li className="px-1 py-2 text-xs text-muted-foreground">{query ? "No one matches." : "Everyone is on the chart."}</li>}
            {available.map((person) => (
              <li key={person.employeeId}>
                <button
                  type="button"
                  onClick={() => addPerson(person)}
                  className="group flex w-full cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-muted"
                  data-testid={`org-chart-add-${person.employeeId}`}
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-secondary-foreground ring-1 ring-border">{initials(person.name)}</span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{person.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{person.positionTitle ?? (person.current ? "No position" : "Not current staff")}</span>
                  </span>
                  <UserPlus className="size-4 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          <Button variant="outline" size="sm" icon={Boxes} onClick={addGroup} data-testid="org-chart-add-group">
            Add group box
          </Button>
          <p className="text-xs leading-relaxed text-muted-foreground">Drag the dot on top of a card onto the person they report to. One person can have many people under them. Click a line to remove it.</p>
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <>
              <Button size="sm" icon={Save} pending={saving} pendingLabel="Saving…" disabled={!dirty} onClick={save} data-testid="org-chart-save">
                Save chart
              </Button>
              <Button size="sm" variant="ghost" icon={RotateCcw} disabled={!dirty || saving} onClick={discard}>
                Discard changes
              </Button>
              <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden="true" />
              <Button size="sm" variant="outline" icon={Wand2} onClick={autoArrange} disabled={nodes.length === 0}>
                Auto-arrange
              </Button>
            </>
          )}
          <Button size="sm" variant="outline" icon={Maximize2} onClick={() => fit()} disabled={nodes.length === 0}>
            Fit to screen
          </Button>
          <span className="ml-auto flex items-center gap-1">
            <Button size="icon-sm" variant="outline" onClick={() => zoomBy(0.85)} aria-label="Zoom out">
              <Minus />
            </Button>
            <span className="w-12 text-center text-xs text-muted-foreground tabular-nums">{Math.round(view.zoom * 100)}%</span>
            <Button size="icon-sm" variant="outline" onClick={() => zoomBy(1.15)} aria-label="Zoom in">
              <Plus />
            </Button>
          </span>
        </div>
        {dirty && canEdit && (
          <p className="rounded-md bg-warning/10 px-3 py-1.5 text-xs text-foreground" role="status">
            {initial.saved ? "You have unsaved changes." : "This first draft was built from the old “reports to” links. Arrange it the way you want, then save."}
          </p>
        )}

        <div
          ref={frameRef}
          className={cn(
            "relative h-[68vh] min-h-96 touch-none overflow-hidden rounded-lg border bg-card shadow-[var(--shadow-soft)] select-none",
            "bg-[radial-gradient(circle,var(--color-border)_1px,transparent_1px)] [background-size:22px_22px]",
            drag?.kind === "pan" ? "cursor-grabbing" : "cursor-grab",
          )}
          onPointerDown={onFramePointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => setDrag(null)}
          onWheel={onWheel}
          data-testid="org-chart-frame"
        >
          {nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
              <Network className="size-8 text-muted-foreground/60" aria-hidden="true" />
              {canEdit ? "Add people from the list, or a group box, then link them." : "No chart has been drawn yet."}
            </div>
          )}
          <div className="absolute top-0 left-0 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
            <svg className="pointer-events-none absolute top-0 left-0 overflow-visible" width="1" height="1" aria-hidden="true">
              {edges.map((edge) => {
                const from = byKey.get(edge.from);
                const to = byKey.get(edge.to);
                if (!from || !to) return null;
                const x1 = from.x + CARD_WIDTH / 2;
                const y1 = from.y + CARD_HEIGHT;
                const x2 = to.x + CARD_WIDTH / 2;
                const y2 = to.y;
                // Standard tree connector: down from the parent, along a bar
                // shared by all its children, then down into the child.
                const bar = y2 > y1 ? y1 + Math.min(28, (y2 - y1) / 2) : y1 + 28;
                const d = `M ${x1} ${y1} V ${bar} H ${x2} V ${y2}`;
                const active = selectedEdge === edge.to;
                return (
                  <g key={`${edge.from}-${edge.to}`}>
                    <path d={d} fill="none" strokeLinejoin="round" className={cn("transition-colors", active ? "stroke-primary" : "stroke-foreground/30")} strokeWidth={active ? 2.5 : 1.5} />
                    {canEdit && (
                      <path
                        d={d}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={14}
                        className="pointer-events-auto cursor-pointer"
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          setSelected(null);
                          setSelectedEdge(edge.to);
                        }}
                      />
                    )}
                  </g>
                );
              })}
              {linkFrom && drag?.kind === "link" && (
                <path
                  d={`M ${linkFrom.x + CARD_WIDTH / 2} ${linkFrom.y} L ${drag.x} ${drag.y}`}
                  fill="none"
                  className="stroke-primary"
                  strokeWidth={2}
                  strokeDasharray="6 5"
                />
              )}
            </svg>

            {unlinkAt && (
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => unlink(unlinkAt.child)}
                className="absolute z-20 flex -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center gap-1 rounded-full bg-destructive px-2 py-1 text-[11px] font-medium text-white shadow-[var(--shadow-raised)]"
                style={{ left: unlinkAt.x, top: unlinkAt.y }}
                data-testid="org-chart-unlink"
              >
                <Link2Off className="size-3" aria-hidden="true" />
                Unlink
              </button>
            )}

            {nodes.map((node) => {
              const color = COLOR[colorOf(node)];
              const person = node.employeeId ? people.get(node.employeeId) : undefined;
              const isSelected = selected === node.key;
              const isTarget = linkTarget === node.key;
              const reports = childCount.get(node.key) ?? 0;
              return (
                <div
                  key={node.key}
                  data-node-key={node.key}
                  onPointerDown={(event) => onCardPointerDown(event, node)}
                  className={cn(
                    "group/card absolute flex flex-col rounded-lg border bg-card shadow-sm transition-[box-shadow,border-color]",
                    canEdit ? "cursor-move" : "cursor-pointer",
                    isSelected && "border-primary ring-3 ring-primary/25",
                    isTarget && "border-primary ring-3 ring-primary/25",
                  )}
                  style={{ left: node.x, top: node.y, width: CARD_WIDTH, height: CARD_HEIGHT }}
                  data-testid={`org-chart-card-${node.key}`}
                >
                  <span className={cn("h-1.5 w-full shrink-0 rounded-t-[11px]", color.bar)} aria-hidden="true" />
                  {node.type === "person" ? (
                    <div className={cn("flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden rounded-b-[11px] px-3", color.soft)}>
                      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold", color.avatar)}>{initials(person?.name ?? "?")}</span>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-semibold" title={person?.name}>
                          {person?.name ?? "Employee"}
                        </span>
                        <span className="truncate text-xs text-muted-foreground" title={[person?.positionTitle, person?.projectName].filter(Boolean).join(" · ")}>
                          {[person?.positionTitle, person?.projectName].filter(Boolean).join(" · ") || "No position"}
                        </span>
                      </span>
                    </div>
                  ) : (
                    <div className={cn("flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden rounded-b-[11px] px-3", color.soft)}>
                      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", color.avatar)}>
                        <Boxes className="size-4" aria-hidden="true" />
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-semibold" title={node.label}>
                          {node.label}
                        </span>
                        <span className="text-xs text-muted-foreground">{reports ? `${reports} under it` : "Group"}</span>
                      </span>
                    </div>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      aria-label={`Choose who ${labelOf(node)} reports to`}
                      title="Drag onto the person they report to"
                      onPointerDown={(event) => onHandlePointerDown(event, node)}
                      className="absolute top-0 left-1/2 z-10 flex size-4 -translate-x-1/2 -translate-y-1/2 cursor-crosshair items-center justify-center rounded-full border-2 border-card bg-primary opacity-60 shadow transition-[opacity,transform] group-hover/card:opacity-100 hover:scale-125"
                      data-testid={`org-chart-handle-${node.key}`}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {selectedNode && (
            <div
              className="absolute top-3 right-3 z-30 flex w-64 flex-col gap-2 rounded-lg border bg-card p-3 text-sm shadow-[var(--shadow-raised)]"
              onPointerDown={(event) => event.stopPropagation()}
              data-testid="org-chart-inspector"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate font-semibold">{labelOf(selectedNode)}</p>
                <button type="button" onClick={() => setSelected(null)} aria-label="Close" className="cursor-pointer text-muted-foreground hover:text-foreground">
                  <X className="size-4" />
                </button>
              </div>
              {canEdit && selectedNode.type === "group" && (
                <Input value={selectedNode.label ?? ""} maxLength={80} onChange={(event) => update(selectedNode.key, { label: event.target.value })} aria-label="Group name" />
              )}
              {canEdit && (
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Card color">
                  {ORG_CHART_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      role="radio"
                      aria-checked={colorOf(selectedNode) === color}
                      aria-label={color}
                      onClick={() => update(selectedNode.key, { color })}
                      className={cn("size-6 cursor-pointer rounded-full ring-offset-2 ring-offset-card", COLOR[color].swatch, colorOf(selectedNode) === color && "ring-2 ring-foreground")}
                    />
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                {selectedNode.employeeId && (
                  <Link href={`/people/${selectedNode.employeeId}`} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted">
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                    Open profile
                  </Link>
                )}
                {canEdit && edges.some((edge) => edge.to === selectedNode.key) && (
                  <Button size="xs" variant="outline" icon={Link2Off} onClick={() => unlink(selectedNode.key)}>
                    Unlink from above
                  </Button>
                )}
                {canEdit && (
                  <Button size="xs" variant="destructive" icon={Trash2} onClick={() => removeCard(selectedNode.key)}>
                    Remove
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
