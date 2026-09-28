import type { OrgChartNode } from "./org-chart-service";

/** Everyone who reports up to `node`, at any level. */
export function teamSize(node: OrgChartNode): number {
  return node.children.reduce((sum, child) => sum + 1 + teamSize(child), 0);
}

export type OrgChartSummary = {
  people: number;
  /** People with at least one direct report. */
  managers: number;
  /** People with no manager on the chart. */
  topLevel: number;
  /** The most direct reports any one person has. */
  largestTeam: number;
  /** Levels from the top of the chart to its deepest person. */
  levels: number;
};

export function summarizeOrgChart(roots: OrgChartNode[]): OrgChartSummary {
  const summary: OrgChartSummary = { people: 0, managers: 0, topLevel: roots.length, largestTeam: 0, levels: 0 };
  const walk = (node: OrgChartNode, depth: number) => {
    summary.people += 1;
    summary.levels = Math.max(summary.levels, depth);
    if (node.children.length > 0) summary.managers += 1;
    summary.largestTeam = Math.max(summary.largestTeam, node.children.length);
    for (const child of node.children) walk(child, depth + 1);
  };
  for (const root of roots) walk(root, 1);
  return summary;
}

export type OrgChartRow = { node: OrgChartNode; depth: number; managerName: string | null };

/** The chart as rows in reading order (each person, then their team), for the list view. */
export function flattenOrgChart(roots: OrgChartNode[]): OrgChartRow[] {
  const rows: OrgChartRow[] = [];
  const walk = (node: OrgChartNode, depth: number, managerName: string | null) => {
    rows.push({ node, depth, managerName });
    for (const child of node.children) walk(child, depth + 1, node.name);
  };
  for (const root of roots) walk(root, 0, null);
  return rows;
}

/** The person and everyone above them, top first; null if they aren't on the chart. */
export function findPath(roots: OrgChartNode[], employeeId: string): OrgChartNode[] | null {
  for (const root of roots) {
    if (root.employeeId === employeeId) return [root];
    const below = findPath(root.children, employeeId);
    if (below) return [root, ...below];
  }
  return null;
}

/** Ids of managers at `depth` or deeper (0 = the top), so the chart can open collapsed below that. */
export function collapsedBeyondDepth(roots: OrgChartNode[], depth: number): Set<string> {
  const collapsed = new Set<string>();
  const walk = (node: OrgChartNode, level: number) => {
    if (node.children.length > 0 && level >= depth) collapsed.add(node.employeeId);
    for (const child of node.children) walk(child, level + 1);
  };
  for (const root of roots) walk(root, 0);
  return collapsed;
}
