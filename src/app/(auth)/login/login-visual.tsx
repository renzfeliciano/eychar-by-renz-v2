"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Building, Users2, CalendarCheck2, ShieldCheck } from "lucide-react";
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

const HIGHLIGHTS = [
  { icon: Users2, label: "Employee records" },
  { icon: CalendarCheck2, label: "Payroll & compensation" },
  { icon: ShieldCheck, label: "Role-based access" },
];

/**
 * Crossfading photo backdrop for the login page's right-hand panel — the
 * gradient wash stays as the scrim (tying it back to this app's own brand
 * color) rather than adopting PCAS's coral tint, since the two apps share
 * this layout but not a palette.
 */
export function LoginVisual({ className }: { className?: string }) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIndex((current) => (current + 1) % IMAGES.length);
    }, SLIDE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className={cn("relative overflow-hidden bg-sidebar text-primary-foreground", className)} aria-hidden="true">
      {IMAGES.map((src, index) => (
        <div
          key={src}
          className={cn("absolute inset-0 opacity-0 transition-opacity duration-[1800ms] ease-in-out", index === activeIndex && "opacity-100")}
        >
          <Image
            src={src}
            alt=""
            fill
            priority={index === 0}
            sizes="50vw"
            className="login-visual-kenburns object-cover"
          />
        </div>
      ))}

      <div className="absolute inset-0 bg-[image:var(--gradient-brand)] opacity-30 lg:opacity-25" />
      {/* Mobile has no text of its own sitting on the raw photo (the card and
          footer below it handle that with their own contrast) — it just
          needs a fairly uniform wash. Desktop's overlay text is bottom-anchored,
          so its scrim only needs to darken toward the bottom. */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/40 to-black/60 lg:bg-gradient-to-t lg:from-black/85 lg:via-black/25 lg:to-black/10" />

      {/* This tagline/highlights/dots overlay is desktop-only: on mobile the
          same branding already lives inside the card, and doubling it up
          here would just clutter the backdrop behind it. */}
      <div className="relative hidden h-full flex-col justify-between p-10 lg:flex xl:p-12">
        <div className="flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-lg bg-white/15 backdrop-blur-sm">
            <Building className="size-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight">WorkforceHub</span>
        </div>

        <div className="flex flex-col gap-4">
          <p className="max-w-sm text-xl font-semibold text-balance drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)] xl:text-2xl">
            One platform for every stage of workforce management.
          </p>
          <div className="flex flex-wrap gap-2">
            {HIGHLIGHTS.map(({ icon: Icon, label }) => (
              <span
                key={label}
                className="flex items-center gap-1.5 rounded-full border border-white/25 bg-black/40 px-3 py-1.5 text-xs font-medium backdrop-blur-sm"
              >
                <Icon className="size-3.5" />
                {label}
              </span>
            ))}
          </div>
          <div className="flex gap-1.5">
            {IMAGES.map((src, index) => (
              <span
                key={src}
                className={cn("h-1.5 rounded-full bg-white/40 transition-all duration-300", index === activeIndex ? "w-5 bg-white" : "w-1.5")}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
