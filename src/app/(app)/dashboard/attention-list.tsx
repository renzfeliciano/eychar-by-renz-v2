import Link from "next/link";
import {
  Banknote,
  BadgeCheck,
  CalendarClock,
  ChevronRight,
  CircleCheck,
  FilePen,
  Gavel,
  IdCard,
  Palmtree,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AttentionItem, AttentionKey, AttentionTone } from "@/domains/dashboard/dashboard-summary";

const ICONS: Record<AttentionKey, LucideIcon> = {
  payrollApproved: Banknote,
  payrollSubmitted: BadgeCheck,
  pendingLeave: Palmtree,
  payrollDrafts: FilePen,
  contractsEnding: CalendarClock,
  missingPayTerms: WalletCards,
  missingGovernmentIds: IdCard,
  openCases: Gavel,
};

const TONE_CHIP: Record<AttentionTone, string> = {
  danger: "bg-destructive/10 text-destructive",
  warning: "bg-warning/15 text-warning",
  info: "bg-primary/10 text-primary",
};

/**
 * The work queue: every count here is something someone has to act on, and
 * each row goes straight to the screen where it's resolved. Only queues the
 * user can see, and only non-empty ones, are listed.
 */
export function AttentionList({ items }: { items: AttentionItem[] }) {
  const total = items.reduce((sum, item) => sum + item.count, 0);

  return (
    <Card className="h-full">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-base">
          Needs attention
          {total > 0 && (
            <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-semibold text-warning tabular-nums">{total}</span>
          )}
        </CardTitle>
        <CardDescription>{items.length > 0 ? "Waiting on you or your team, most urgent first." : "Approvals, payroll and records that need action."}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col px-0">
        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-8 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-success/10 text-success" aria-hidden="true">
              <CircleCheck className="size-5" />
            </span>
            <p className="text-sm font-medium">You&apos;re all caught up</p>
            <p className="max-w-xs text-xs text-muted-foreground">No approvals, payroll or record gaps are waiting right now.</p>
          </div>
        ) : (
          <ul className="-mt-(--card-spacing) divide-y" aria-label="Items that need attention">
            {items.map((item) => {
              const Icon = ICONS[item.key];
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    className="group/row flex items-center gap-3 px-(--card-spacing) py-3 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                  >
                    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", TONE_CHIP[item.tone])} aria-hidden="true">
                      <Icon className="size-4.5" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">{item.title}</span>
                      <span className="truncate text-xs text-muted-foreground">{item.description}</span>
                    </span>
                    <span className="text-lg font-semibold tabular-nums">{item.count}</span>
                    <ChevronRight
                      className="size-4 shrink-0 text-muted-foreground transition-transform group-hover/row:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
