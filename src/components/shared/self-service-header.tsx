"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme-toggle";
import { Logo } from "./logo";
import { BrandName } from "./brand-name";

export function SelfServiceHeader({ name }: { name: string }) {
  return (
    <header className="glass-surface sticky top-0 z-10 flex h-16 items-center gap-3 border-b px-4 md:px-6">
      <Logo priority />
      <BrandName className="shrink-0 text-sm" />
      <div className="ml-auto flex min-w-0 items-center gap-3">
        <span className="min-w-0 truncate text-sm text-muted-foreground" title={name}>
          {name}
        </span>
        <ThemeToggle />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Sign out"
          onClick={() => signOut({ callbackUrl: "/login" })}
          data-testid="self-service-sign-out-button"
        >
          <LogOut className="size-4" />
        </Button>
      </div>
    </header>
  );
}
