import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";

/**
 * The product wordmark: "EychAr" with its "by Renz" byline, and optionally
 * the pronunciation tagline underneath ("/eɪtʃ ɑːr/ · people, time and
 * payroll"). Purely presentational; the org's own name never goes here.
 */
export function BrandName({ tagline = false, className, nameClassName }: { tagline?: boolean; className?: string; nameClassName?: string }) {
  return (
    <span className={cn("flex min-w-0 flex-col leading-tight", className)}>
      <span className={cn("truncate font-semibold tracking-tight", nameClassName)}>
        {BRAND.name} <span className="font-normal text-muted-foreground">{BRAND.byline}</span>
      </span>
      {tagline && (
        <span className="truncate text-xs text-muted-foreground" title={`${BRAND.name} ${BRAND.pronunciation} · ${BRAND.tagline}`}>
          <span className="sr-only">Pronounced aitch-ar. </span>
          <span aria-hidden="true">{BRAND.pronunciation}</span> · {BRAND.tagline}
        </span>
      )}
    </span>
  );
}
