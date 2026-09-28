"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * A two-state light/dark switch, not a three-way system/light/dark menu —
 * simpler to operate with one click, and `next-themes` still respects the
 * OS preference on first load via `defaultTheme="system"` in Providers.
 * Rendered only after mount: `resolvedTheme` is undefined on the server,
 * and guessing wrong for a split second is worse than a brief blank slot.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Unlike ConcurrentSessionGuard's reset-effect (removed there in favor
    // of keying off the error value), there's no prop to derive "has the
    // client finished hydrating" from — this is the one legitimate case
    // for a mount-only setState, and next-themes' own docs recommend it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted) return <Button variant="ghost" size="icon" aria-hidden="true" disabled className="opacity-0" />;

  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      data-testid="theme-toggle"
      className="relative overflow-hidden"
    >
      {/* Cross-fade from half size, never from scale(0) — an icon popping out
          of nothing reads as a glitch, not a transition. */}
      <Sun className="size-4 scale-100 rotate-0 opacity-100 transition-[transform,translate,scale,rotate,opacity] duration-200 dark:scale-50 dark:-rotate-45 dark:opacity-0" />
      <Moon className="absolute size-4 scale-50 rotate-45 opacity-0 transition-[transform,translate,scale,rotate,opacity] duration-200 dark:scale-100 dark:rotate-0 dark:opacity-100" />
    </Button>
  );
}
