"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A table cell's content cut to its column's width with an ellipsis. When
 * (and only when) something is actually cut off, hovering or focusing it
 * shows the full text as a tooltip. Screen readers always get the full text,
 * since nothing is removed from the page.
 */
export function TruncatedCell({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState<string | undefined>();

  function measure() {
    const element = ref.current;
    if (!element) return;
    const overflowing = [element, ...element.querySelectorAll<HTMLElement>("*")].some((node) => node.scrollWidth > node.clientWidth + 1);
    setTitle(overflowing ? element.textContent?.replace(/\s+/g, " ").trim() || undefined : undefined);
  }

  return (
    <div ref={ref} title={title} onPointerOver={measure} onMouseOver={measure} onFocus={measure} className={cn(
        // Cut the text itself, not just the box: links, spans and lines inside get the
        // ellipsis too, and flex children may shrink below their content width.
        "md:truncate md:[&_*]:min-w-0 md:[&_:is(a,span,p)]:truncate",
        className,
      )} data-testid="truncated-cell">
      {children}
    </div>
  );
}
