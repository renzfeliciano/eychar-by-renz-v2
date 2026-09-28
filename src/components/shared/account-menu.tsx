"use client";

import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { Building2, ChevronDown, KeyRound, LogOut, ShieldCheck } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

function initials(name: string) {
  return name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

type Props = {
  displayName: string;
  username?: string | null;
  email?: string | null;
  organizationName: string;
  roleNames: string[];
  canManageAccess: boolean;
};

/**
 * Who's signed in, in which organization, with which roles, and the
 * account's actions. The trigger shows the name and main role on wider
 * screens so people can tell at a glance which account they're in.
 */
export function AccountMenu({ displayName, username, email, organizationName, roleNames, canManageAccess }: Props) {
  const router = useRouter();
  const primaryRole = roleNames[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Account menu for ${displayName}`}
        className="group flex items-center gap-2 rounded-full py-0.5 pr-0.5 pl-0.5 outline-none transition-[background-color,box-shadow] duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-muted sm:rounded-lg sm:pr-2"
        data-testid="account-menu-trigger"
      >
        <Avatar className="size-8">
          <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">{initials(displayName)}</AvatarFallback>
        </Avatar>
        <span className="hidden min-w-0 flex-col text-left leading-tight lg:flex" aria-hidden="true">
          <span className="max-w-40 truncate text-sm font-medium">{displayName}</span>
          {primaryRole && <span className="max-w-40 truncate text-xs text-muted-foreground">{primaryRole}</span>}
        </span>
        <ChevronDown className="hidden size-3.5 text-muted-foreground transition-[rotate] duration-150 group-data-popup-open:rotate-180 sm:block" aria-hidden="true" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="w-72 p-0">
        <div className="flex items-start gap-3 p-3">
          <Avatar className="size-10">
            <AvatarFallback className="bg-primary text-sm font-semibold text-primary-foreground">{initials(displayName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{displayName}</p>
            {username && <p className="truncate text-xs text-muted-foreground">@{username}</p>}
            {email && <p className="truncate text-xs text-muted-foreground">{email}</p>}
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t bg-muted/40 px-3 py-2.5">
          <p className="flex items-start gap-2 text-xs">
            <Building2 className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="leading-snug">{organizationName}</span>
          </p>
          {roleNames.length > 0 && (
            <div className="flex flex-wrap gap-1" aria-label="Your roles">
              {roleNames.map((role) => (
                <span key={role} className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                  {role}
                </span>
              ))}
            </div>
          )}
        </div>

        <DropdownMenuGroup className="border-t p-1">
          <DropdownMenuItem onClick={() => router.push("/account/security")} className="gap-2 px-2 py-1.5">
            <KeyRound className="size-4 text-muted-foreground" />
            Security
          </DropdownMenuItem>
          {canManageAccess && (
            <DropdownMenuItem onClick={() => router.push("/settings/access")} className="gap-2 px-2 py-1.5">
              <ShieldCheck className="size-4 text-muted-foreground" />
              Users &amp; access
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="my-0" />
        <div className="p-1">
          <DropdownMenuItem variant="destructive" onClick={() => signOut({ callbackUrl: "/login" })} className="gap-2 px-2 py-1.5" data-testid="account-menu-sign-out">
            <LogOut className="size-4" />
            Sign out
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
