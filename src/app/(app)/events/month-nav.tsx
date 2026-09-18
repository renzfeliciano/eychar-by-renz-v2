"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const MONTH_FORMATTER = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });

function shiftMonth(month: string, delta: number): string {
  const [year, monthNum] = month.split("-").map(Number);
  const total = year * 12 + (monthNum - 1) + delta;
  const nextYear = Math.floor(total / 12);
  const nextMonth = ((total % 12) + 12) % 12;
  return `${nextYear}-${String(nextMonth + 1).padStart(2, "0")}`;
}

export function MonthNav({ month }: { month: string }) {
  const router = useRouter();
  const [year, monthNum] = month.split("-").map(Number);

  return (
    <div className="flex items-center gap-3">
      <Button type="button" variant="outline" size="icon" onClick={() => router.push(`/events?month=${shiftMonth(month, -1)}`)} aria-label="Previous month">
        <ChevronLeft className="size-4" />
      </Button>
      <span className="min-w-40 text-center text-sm font-semibold">
        {MONTH_FORMATTER.format(new Date(Date.UTC(year, monthNum - 1, 1)))}
      </span>
      <Button type="button" variant="outline" size="icon" onClick={() => router.push(`/events?month=${shiftMonth(month, 1)}`)} aria-label="Next month">
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}
