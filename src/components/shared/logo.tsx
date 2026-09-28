import Image from "next/image";
import { cn } from "@/lib/utils";

const INTRINSIC_WIDTH = 521;
const INTRINSIC_HEIGHT = 479;

/**
 * The v1 PCAS mark. It's navy on transparent, so it always sits on its own
 * white tile: legible in dark mode and over the login photography alike.
 */
export function Logo({ className, priority = false }: { className?: string; priority?: boolean }) {
  return (
    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg bg-white p-0.5 ring-1 ring-black/5", className)}>
      <Image
        src="/assets/images/pcas-logo-transparent.png"
        alt="PCAS"
        width={INTRINSIC_WIDTH}
        height={INTRINSIC_HEIGHT}
        className="h-auto w-full"
        priority={priority}
      />
    </span>
  );
}
