type CellLike = { code: string; name: string; kind: "work" | "rest"; color: string };
type RowLike = { cells: Record<string, CellLike> };

export type DayHeadcount = {
  working: number;
  off: number;
  unscheduled: number;
  /** Per shift code, most-used first. */
  byShift: { code: string; name: string; kind: "work" | "rest"; color: string; count: number }[];
};

/** Who's working, off, and not yet scheduled on one day of the month's plan. */
export function dayHeadcount(rows: RowLike[], date: string): DayHeadcount {
  const byCode = new Map<string, DayHeadcount["byShift"][number]>();
  let working = 0;
  let off = 0;
  for (const row of rows) {
    const cell = row.cells[date];
    if (!cell) continue;
    if (cell.kind === "work") working++;
    else off++;
    const current = byCode.get(cell.code);
    if (current) current.count++;
    else byCode.set(cell.code, { code: cell.code, name: cell.name, kind: cell.kind, color: cell.color, count: 1 });
  }
  return {
    working,
    off,
    unscheduled: rows.length - working - off,
    byShift: [...byCode.values()].sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)),
  };
}
