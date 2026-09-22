"use client";

import { useRef, useState } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import type { HiringTrendPoint } from "./dashboard-types";

const VIEW_WIDTH = 700;
const VIEW_HEIGHT = 180;
const PAD_LEFT = 12;
const PAD_RIGHT = 12;
const PAD_TOP = 28;
const PAD_BOTTOM = 24;

/** Line + area trend chart with a hover crosshair, per the dataviz skill's
    interaction reference — a plot is interactive by default, not an add-on. */
export function HiringTrendChart({ points }: { points: HiringTrendPoint[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const total = points.reduce((sum, point) => sum + point.count, 0);
  if (total === 0) {
    return <EmptyState title="No hires in the last 12 months" description="New hires will show up here as employees are added." />;
  }

  const plotWidth = VIEW_WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = VIEW_HEIGHT - PAD_TOP - PAD_BOTTOM;
  const max = Math.max(1, ...points.map((p) => p.count));
  const baseline = PAD_TOP + plotHeight;

  const xAt = (i: number) => PAD_LEFT + (points.length === 1 ? plotWidth / 2 : (i / (points.length - 1)) * plotWidth);
  const yAt = (count: number) => PAD_TOP + (1 - count / max) * plotHeight;

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i)} ${yAt(p.count)}`).join(" ");
  const areaPath = `${linePath} L ${xAt(points.length - 1)} ${baseline} L ${xAt(0)} ${baseline} Z`;
  const tickEvery = Math.max(1, Math.ceil(points.length / 4));
  const last = points[points.length - 1];

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const relativeX = ((event.clientX - rect.left) / rect.width) * VIEW_WIDTH;
    let nearest = 0;
    let nearestDistance = Infinity;
    points.forEach((_, i) => {
      const distance = Math.abs(xAt(i) - relativeX);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = i;
      }
    });
    setHoverIndex(nearest);
  }

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        role="img"
        aria-label="New hires per month over the last 12 months"
        className="w-full touch-none"
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverIndex(null)}
      >
        <line x1={PAD_LEFT} y1={baseline} x2={VIEW_WIDTH - PAD_RIGHT} y2={baseline} stroke="var(--viz-gridline)" strokeWidth={1} />
        <path d={areaPath} fill="var(--viz-series-1)" fillOpacity={0.12} stroke="none" />
        <path d={linePath} fill="none" stroke="var(--viz-series-1)" strokeWidth={2} strokeLinejoin="round" />
        {hoverIndex !== null && (
          <line x1={xAt(hoverIndex)} y1={PAD_TOP} x2={xAt(hoverIndex)} y2={baseline} stroke="var(--viz-ink-muted)" strokeWidth={1} strokeDasharray="3 3" />
        )}
        {points.map((point, i) => {
          const isEnd = i === points.length - 1;
          const isHovered = i === hoverIndex;
          if (!isEnd && !isHovered) return null;
          return <circle key={point.month} cx={xAt(i)} cy={yAt(point.count)} r={4} fill="var(--viz-series-1)" />;
        })}
        <text x={xAt(points.length - 1)} y={yAt(last.count) - 10} textAnchor="middle" className="fill-foreground text-[11px] font-semibold">
          {last.count}
        </text>
        {points.map((point, i) =>
          i % tickEvery === 0 || i === points.length - 1 ? (
            <text key={point.month} x={xAt(i)} y={VIEW_HEIGHT - 6} textAnchor="middle" className="fill-muted-foreground text-[10px]">
              {point.label}
            </text>
          ) : null,
        )}
      </svg>
      {hovered && (
        <div
          role="status"
          className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-md border bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground shadow-md"
          style={{ left: `${(xAt(hoverIndex!) / VIEW_WIDTH) * 100}%` }}
        >
          <b className="tabular-nums">{hovered.count}</b> hired · {hovered.label}
        </div>
      )}
    </div>
  );
}
