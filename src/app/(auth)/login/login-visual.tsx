"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

const IMAGES = [
  "/assets/images/login/pcas-login-bg-1.jpg",
  "/assets/images/login/pcas-login-bg-2.jpg",
  "/assets/images/login/pcas-login-bg-3.jpg",
  "/assets/images/login/pcas-login-bg-4.jpg",
  "/assets/images/login/pcas-login-bg-5.jpg",
  "/assets/images/login/pcas-login-bg-6.jpg",
];

const SLIDE_INTERVAL_MS = 7000;

/**
 * The login page's full-bleed photo carousel and the brand story that sits
 * on it. Renders two siblings for the page's grid: the photo layer
 * (absolutely positioned behind everything, sign-in panel included) and the
 * story column. The scrim is neutral black for legibility only, never a
 * brand-color wash over the photography.
 */
export function LoginVisual() {
  const [activeIndex, setActiveIndex] = useState(0);

  // Re-armed on every change, so picking a photo by hand gives it a full turn too.
  useEffect(() => {
    const timer = setTimeout(() => setActiveIndex((current) => (current + 1) % IMAGES.length), SLIDE_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [activeIndex]);

  return (
    <>
      <div className="absolute inset-0 overflow-hidden bg-neutral-950" aria-hidden="true">
        {IMAGES.map((src, index) => (
          <div key={src} className={cn("absolute inset-0 opacity-0 transition-opacity duration-[1800ms] ease-in-out", index === activeIndex && "opacity-100")}>
            <Image src={src} alt="" fill priority={index === 0} sizes="100vw" className="login-visual-kenburns object-cover" />
          </div>
        ))}
        {/* Phones: darken top and bottom (brand above, headline over the sheet's edge).
            Desktop: the story sits bottom-left, so the scrim leans that way. */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/65 via-black/25 to-black/75 lg:bg-gradient-to-tr lg:from-black/85 lg:via-black/40 lg:to-black/15" />
      </div>

      {/* The brand lives on the sign-in card, so the photo side carries only
          the message and the carousel's progress. */}
      <section className="relative z-10 flex min-h-0 flex-col justify-end gap-6 p-6 pb-8 text-white sm:p-8 lg:justify-between lg:p-12 xl:p-16" aria-label="About WorkforceHub">
        <p className="hidden animate-in text-sm font-medium text-white/85 duration-500 fade-in lg:block">Project Concepts and Administrative Services, Inc.</p>

        <div className="flex flex-col gap-6">
          <div className="flex max-w-2xl animate-in flex-col gap-4 duration-700 ease-out fade-in slide-in-from-bottom-4 max-lg:[@media(max-height:700px)]:hidden">
            <p className="text-3xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-4xl lg:text-5xl xl:text-6xl">
              Your whole workforce,
              <span className="block text-white/55">in one place.</span>
            </p>
            <p className="hidden max-w-md text-base leading-relaxed text-white/75 sm:block">Records, attendance, schedules, leave and payroll for every team and every site.</p>
          </div>

          <div className="flex w-full max-w-xs gap-1.5">
            {IMAGES.map((src, index) => (
              <button
                key={src}
                type="button"
                onClick={() => setActiveIndex(index)}
                aria-label={`Show photo ${index + 1} of ${IMAGES.length}`}
                aria-current={index === activeIndex ? "true" : undefined}
                className="group flex h-6 flex-1 cursor-pointer items-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <span className="h-[3px] w-full overflow-hidden rounded-full bg-white/25 transition-[background-color] duration-150 group-hover:bg-white/45">
                  <span
                    // Keyed by the active photo so the fill restarts from empty on every turn.
                    key={index === activeIndex ? `active-${activeIndex}` : "idle"}
                    className={cn(
                      "block h-full origin-left rounded-full bg-white",
                      index < activeIndex && "scale-x-100",
                      index > activeIndex && "scale-x-0",
                      index === activeIndex && "login-progress-fill",
                    )}
                    style={
                      {
                        "--login-slide-ms": `${SLIDE_INTERVAL_MS}ms`,
                      } as React.CSSProperties
                    }
                  />
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
