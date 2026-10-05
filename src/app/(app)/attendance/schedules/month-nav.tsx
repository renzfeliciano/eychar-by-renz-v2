"use client";

import { usePendingNavigation } from "@/components/shared/navigation-pending";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function MonthNav({ month, label }: { month: string; label: string }) {
  const { push } = usePendingNavigation();
  const go = (next: string) => push(`/attendance/schedules?month=${next}`);

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon-sm" onClick={() => go(shiftMonth(month, -1))} aria-label="Previous month" data-testid="schedule-prev-month">
        <ChevronLeft />
      </Button>
      <Input
        type="month"
        aria-label="Month"
        value={month}
        onChange={(event) => event.target.value && go(event.target.value)}
        className="w-44"
        data-testid="schedule-month-input"
      />
      <Button variant="outline" size="icon-sm" onClick={() => go(shiftMonth(month, 1))} aria-label="Next month" data-testid="schedule-next-month">
        <ChevronRight />
      </Button>
      <span className="sr-only" aria-live="polite">
        Showing {label}
      </span>
    </div>
  );
}
