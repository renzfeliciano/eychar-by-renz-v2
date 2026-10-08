import Image from "next/image";
import { cn } from "@/lib/utils";

const ASSETS = "/assets/images";

/**
 * The animated EychAr loader, on a transparent background (no card, no ground
 * line). A tower crane hoists floor slabs into place in quick succession (the whole loop runs about 2 s), the
 * tower rises with a PCAS sign panel on its facade, then the windows light and
 * the EychAr wordmark lands letter by letter. Beside it trees sway, clouds and a
 * bird drift by, and employees walk in through the door. Decorative only (the
 * surrounding status carries the announcement), so it is hidden from assistive tech.
 *
 * Four images are rendered and CSS (`.brand-loader` in globals.css) shows
 * exactly one: the light or dark animation by theme, or a still of the finished
 * frame for people who prefer reduced motion. Hidden images are lazy, so only
 * the visible one is fetched. The files are 256px animated WebP with alpha,
 * shown at `size` 112 by default (the stage uses 192; both sharp on retina).
 */
export function BrandLoader({ size = 112, className }: { size?: number; className?: string }) {
  const common = { width: 256, height: 256, unoptimized: true } as const;
  return (
    <span aria-hidden="true" data-testid="brand-loader" className={cn("brand-loader relative inline-block shrink-0", className)} style={{ width: size, height: size }}>
      <Image {...common} alt="" src={`${ASSETS}/eychar-loader-light.webp`} className="bl-light-anim size-full" />
      <Image {...common} alt="" src={`${ASSETS}/eychar-loader-dark.webp`} className="bl-dark-anim size-full" />
      <Image {...common} alt="" src={`${ASSETS}/eychar-loader-light-still.png`} className="bl-light-still size-full" />
      <Image {...common} alt="" src={`${ASSETS}/eychar-loader-dark-still.png`} className="bl-dark-still size-full" />
    </span>
  );
}
