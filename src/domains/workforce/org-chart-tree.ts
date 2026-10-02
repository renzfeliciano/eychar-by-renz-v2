/**
 * Rules and layout for the org chart canvas (ADR-046), shared by the server
 * (validating a save, laying out the first chart) and the browser (checking a
 * link before it's drawn, Auto-arrange). Pure: no database, no DOM.
 */

export type ChartNode = { key: string; type: "person" | "group"; employeeId?: string; label?: string; color?: string; x: number; y: number };
export type ChartEdge = { from: string; to: string };

export const CARD_WIDTH = 220;
export const CARD_HEIGHT = 76;
const GAP_X = 40;
const GAP_Y = 90;

/** Every way a set of cards and links can break the tree, in plain words. Empty when valid. */
export function chartProblems(nodes: ChartNode[], edges: ChartEdge[]): string[] {
  const problems: string[] = [];
  const keys = new Set<string>();
  const employees = new Set<string>();
  for (const node of nodes) {
    if (keys.has(node.key)) problems.push(`Two cards share the key ${node.key}`);
    keys.add(node.key);
    if (node.employeeId) {
      if (employees.has(node.employeeId)) problems.push("Someone is on the chart twice");
      employees.add(node.employeeId);
    }
  }
  const parentOf = new Map<string, string>();
  for (const edge of edges) {
    if (!keys.has(edge.from) || !keys.has(edge.to)) problems.push("A line points to a card that isn't on the chart");
    else if (edge.from === edge.to) problems.push("A card can't be linked to itself");
    else if (parentOf.has(edge.to)) problems.push("A card can only sit under one card");
    else parentOf.set(edge.to, edge.from);
  }
  for (const start of parentOf.keys()) {
    const seen = new Set<string>([start]);
    let current = parentOf.get(start);
    while (current) {
      if (seen.has(current)) {
        problems.push("The links go round in a circle");
        return [...new Set(problems)];
      }
      seen.add(current);
      current = parentOf.get(current);
    }
  }
  return [...new Set(problems)];
}

/** Whether linking `child` under `parent` keeps the chart a tree (no self-link, no circle). */
export function canLink(edges: ChartEdge[], parent: string, child: string): boolean {
  if (parent === child) return false;
  const parentOf = new Map(edges.filter((edge) => edge.to !== child).map((edge) => [edge.to, edge.from]));
  let current: string | undefined = parent;
  while (current) {
    if (current === child) return false;
    current = parentOf.get(current);
  }
  return true;
}

/** Links `child` under `parent`, replacing the child's previous parent. */
export function link(edges: ChartEdge[], parent: string, child: string): ChartEdge[] {
  return [...edges.filter((edge) => edge.to !== child), { from: parent, to: child }];
}

/**
 * A tidy top-down tree: each card centered over its children, siblings side
 * by side, separate trees left to right. Cards keep their keys; only x/y
 * change. Siblings keep their current left-to-right order.
 */
export function arrange(nodes: ChartNode[], edges: ChartEdge[]): ChartNode[] {
  const byKey = new Map(nodes.map((node) => [node.key, node]));
  const children = new Map<string, string[]>();
  const hasParent = new Set<string>();
  for (const edge of edges) {
    if (!byKey.has(edge.from) || !byKey.has(edge.to)) continue;
    children.set(edge.from, [...(children.get(edge.from) ?? []), edge.to]);
    hasParent.add(edge.to);
  }
  for (const list of children.values()) list.sort((a, b) => byKey.get(a)!.x - byKey.get(b)!.x);
  const roots = nodes.filter((node) => !hasParent.has(node.key)).sort((a, b) => a.x - b.x || a.y - b.y);

  const width = new Map<string, number>();
  const measure = (key: string): number => {
    const kids = children.get(key) ?? [];
    const total = kids.length ? kids.reduce((sum, kid) => sum + measure(kid), 0) + GAP_X * (kids.length - 1) : CARD_WIDTH;
    width.set(key, Math.max(total, CARD_WIDTH));
    return width.get(key)!;
  };
  const placed = new Map<string, { x: number; y: number }>();
  const place = (key: string, left: number, depth: number) => {
    const span = width.get(key)!;
    placed.set(key, { x: Math.round(left + span / 2 - CARD_WIDTH / 2), y: depth * (CARD_HEIGHT + GAP_Y) });
    let cursor = left;
    for (const kid of children.get(key) ?? []) {
      place(kid, cursor, depth + 1);
      cursor += width.get(kid)! + GAP_X;
    }
  };
  let left = 0;
  for (const root of roots) {
    measure(root.key);
    place(root.key, left, 0);
    left += width.get(root.key)! + GAP_X * 2;
  }
  return nodes.map((node) => ({ ...node, ...(placed.get(node.key) ?? { x: node.x, y: node.y }) }));
}
