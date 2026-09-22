import { EmptyState } from "@/components/shared/empty-state";
import type { ColoredBucket } from "./dashboard-types";

const RADIUS = 70;
const STROKE_WIDTH = 26;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function DonutChart({
  buckets,
  ariaLabel,
  centerLabel,
  emptyTitle,
  emptyDescription,
}: {
  buckets: ColoredBucket[];
  ariaLabel: string;
  centerLabel: string;
  emptyTitle: string;
  emptyDescription: string;
}) {
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  if (total === 0) return <EmptyState title={emptyTitle} description={emptyDescription} />;

  const { segments } = buckets.reduce<{ segments: (ColoredBucket & { dashArray: string; dashOffset: number })[]; cumulative: number }>(
    (acc, bucket) => {
      const fraction = bucket.count / total;
      const dashArray = `${fraction * CIRCUMFERENCE} ${CIRCUMFERENCE}`;
      const dashOffset = -acc.cumulative * CIRCUMFERENCE;
      return { segments: [...acc.segments, { ...bucket, dashArray, dashOffset }], cumulative: acc.cumulative + fraction };
    },
    { segments: [], cumulative: 0 },
  );

  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 200 200" role="img" aria-label={ariaLabel} className="size-36 shrink-0">
        <circle cx="100" cy="100" r={RADIUS} fill="none" stroke="var(--muted)" strokeWidth={STROKE_WIDTH} />
        {segments.map((segment) => (
          <circle
            key={segment.label}
            cx="100"
            cy="100"
            r={RADIUS}
            fill="none"
            stroke={segment.color}
            strokeWidth={STROKE_WIDTH}
            strokeDasharray={segment.dashArray}
            strokeDashoffset={segment.dashOffset}
            transform="rotate(-90 100 100)"
          />
        ))}
        <text x="100" y="95" textAnchor="middle" className="fill-foreground text-[2.25rem] font-extrabold">
          {total}
        </text>
        <text x="100" y="122" textAnchor="middle" className="fill-muted-foreground text-[0.9rem]">
          {centerLabel}
        </text>
      </svg>
      <ul className="flex flex-1 flex-col gap-2 text-sm">
        {segments.map((segment) => (
          <li key={segment.label} className="flex items-center gap-2">
            <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: segment.color }} />
            <span className="flex-1 truncate text-muted-foreground">{segment.label}</span>
            <span className="font-medium tabular-nums">
              {segment.count} <span className="text-xs font-normal text-muted-foreground">({Math.round((segment.count / total) * 100)}%)</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
