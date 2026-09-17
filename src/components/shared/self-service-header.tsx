"use client";

import { signOut } from "next-auth/react";
import { Building, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme-toggle";

export function SelfServiceHeader({ name }: { name: string }) {
  return (
    <header className="glass-surface sticky top-0 z-10 flex h-16 items-center gap-3 border-b px-4 md:px-6">
      <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Building className="size-4" />
      </div>
      <span className="text-sm font-semibold">WorkforceHub</span>
      <div className="ml-auto flex items-center gap-3">
        <span className="text-sm text-muted-foreground">{name}</span>
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
