"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

/**
 * What a route's error.tsx shows: inside the app's own frame (sidebar and
 * header stay), so one page failing never takes the navigation with it.
 * Server errors reach the browser without their message, only a digest;
 * showing it as a reference lets an administrator find it in the logs.
 */
export function SectionError({
  error,
  reset,
  homeHref = "/dashboard",
  homeLabel = "Back to dashboard",
}: {
  error: Error & { digest?: string };
  reset: () => void;
  homeHref?: string;
  homeLabel?: string;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl border bg-card px-6 py-10 text-center shadow-[var(--shadow-soft)]" data-testid="section-error">
      <span className="flex size-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive" aria-hidden="true">
        <TriangleAlert className="size-5" />
      </span>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-lg font-semibold">This page couldn&apos;t load</h1>
        <p className="text-sm text-balance text-muted-foreground">
          Nothing you saved before was lost. Try again, or go back and start from there. If it keeps happening, send your administrator the reference below.
        </p>
      </div>
      {error.digest && (
        <p className="rounded-md bg-muted px-2.5 py-1 font-mono text-xs text-muted-foreground" data-testid="section-error-reference">
          Reference: {error.digest}
        </p>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={reset} data-testid="section-error-retry">
          <RotateCcw className="size-3.5" aria-hidden="true" />
          Try again
        </Button>
        <Link href={homeHref} className={buttonVariants({ variant: "outline" })}>
          {homeLabel}
        </Link>
      </div>
    </div>
  );
}
