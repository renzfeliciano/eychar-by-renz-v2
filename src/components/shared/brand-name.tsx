import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";

/**
 * The product wordmark: "PCAS HRIS", and optionally the tagline underneath
 * ("people, time and payroll"). Purely presentational.
 */
export function BrandName({
  tagline = false,
  className,
  nameClassName,
}: {
  tagline?: boolean;
  className?: string;
  nameClassName?: string;
}) {
  return (
    <span className={cn("flex min-w-0 flex-col leading-tight", className)}>
      <span
        className={cn("truncate font-semibold tracking-tight", nameClassName)}
      >
        {BRAND.name}
      </span>
      {tagline && (
        <span className="truncate text-xs text-muted-foreground" title={`${BRAND.name} · ${BRAND.tagline}`}>
          {BRAND.tagline}
        </span>
      )}
    </span>
  );
}
