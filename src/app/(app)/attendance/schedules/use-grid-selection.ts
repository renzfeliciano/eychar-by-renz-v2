"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

export const cellKey = (employeeId: string, date: string) => `${employeeId}|${date}`;

export type CellPosition = { employeeId: string; dayIndex: number };

// A drag paints a rectangle on top of whatever was selected when it began;
// starting on an already-selected day erases instead, like a spreadsheet.
type DragState = { start: CellPosition; base: Set<string>; mode: "add" | "remove"; moved: boolean };

/**
 * The schedule grid's day selection, spreadsheet style: click toggles a day,
 * shift-click selects a block from the last day clicked, dragging paints (or
 * erases) a block, and a row or column header toggles it all. Keys are
 * "employeeId|YYYY-MM-DD".
 */
export function useGridSelection({ visibleRows, days }: { visibleRows: { employeeId: string }[]; days: { date: string }[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<CellPosition | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);

  /** Every day between two cells, across every visible employee between them. */
  function blockKeys(from: CellPosition, to: CellPosition): string[] {
    const fromRow = visibleRows.findIndex((row) => row.employeeId === from.employeeId);
    const toRow = visibleRows.findIndex((row) => row.employeeId === to.employeeId);
    if (fromRow < 0 || toRow < 0) return [cellKey(to.employeeId, days[to.dayIndex].date)];
    const [rowStart, rowEnd] = fromRow < toRow ? [fromRow, toRow] : [toRow, fromRow];
    const [dayStart, dayEnd] = from.dayIndex < to.dayIndex ? [from.dayIndex, to.dayIndex] : [to.dayIndex, from.dayIndex];
    const keys: string[] = [];
    for (let r = rowStart; r <= rowEnd; r++) {
      for (let d = dayStart; d <= dayEnd; d++) keys.push(cellKey(visibleRows[r].employeeId, days[d].date));
    }
    return keys;
  }

  function clearSelection() {
    setSelected(new Set());
    setAnchor(null);
  }

  function handleCellClick(position: CellPosition, extendRange: boolean) {
    // The click that ends a drag lands on the last cell; the drag already selected it.
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setSelected((current) => {
      const next = new Set(current);
      if (extendRange && anchor) {
        for (const key of blockKeys(anchor, position)) next.add(key);
      } else {
        const key = cellKey(position.employeeId, days[position.dayIndex].date);
        if (next.has(key)) next.delete(key);
        else next.add(key);
      }
      return next;
    });
    setAnchor(position);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>, position: CellPosition) {
    // Touch keeps its native sideways scroll of the grid; taps and the row/column headers cover selection there.
    if (event.pointerType === "touch" || event.button > 0 || event.shiftKey) return;
    const key = cellKey(position.employeeId, days[position.dayIndex].date);
    dragRef.current = { start: position, base: new Set(selected), mode: selected.has(key) ? "remove" : "add", moved: false };

    const endDrag = () => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (drag?.moved) {
        suppressClickRef.current = true;
        // Released outside a cell means no click follows to consume the flag.
        setTimeout(() => (suppressClickRef.current = false), 0);
      }
    };
    window.addEventListener("pointerup", endDrag, { once: true });
  }

  function handlePointerEnter(position: CellPosition) {
    const drag = dragRef.current;
    if (!drag) return;
    if (!drag.moved && drag.start.employeeId === position.employeeId && drag.start.dayIndex === position.dayIndex) return;
    drag.moved = true;
    const next = new Set(drag.base);
    for (const key of blockKeys(drag.start, position)) {
      if (drag.mode === "add") next.add(key);
      else next.delete(key);
    }
    setSelected(next);
    setAnchor(position);
  }

  // Row/column headers toggle as a group: select all, or deselect if already all selected.
  function toggleGroup(keys: string[]) {
    setSelected((current) => {
      const next = new Set(current);
      const allSelected = keys.every((key) => next.has(key));
      for (const key of keys) {
        if (allSelected) next.delete(key);
        else next.add(key);
      }
      return next;
    });
  }

  function selectedPositions() {
    return [...selected].map((key) => {
      const [employeeId, date] = key.split("|");
      return { employeeId, date };
    });
  }

  return { selected, setAnchor, clearSelection, handleCellClick, handlePointerDown, handlePointerEnter, toggleGroup, selectedPositions };
}
