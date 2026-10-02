"use client";

import { useState } from "react";
import { Briefcase, CalendarPlus, History, Scale, UserRound } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatRelativeDays } from "@/lib/relative-time";
import { formatDate } from "@/lib/app-time";

export type CaseDetail = {
  caseName: string;
  caseNumber: string;
  projectName: string;
  classificationName: string;
  statusCode: string;
  statusName: string;
  legalCounsel?: string | null;
  briefHistory?: string | null;
  createdAt: string;
  updatedAt: string;
};

// The day the case was recorded, on the organization's calendar (formatDate adds the time zone).
const LONG_DATE = { month: "long", day: "numeric", year: "numeric" } as const;

/** The case name in the table, opening the full record in a side panel. */
export function CaseDetailSheet({ item, nowIso, actions }: { item: CaseDetail; nowIso: string; actions?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const now = new Date(nowIso);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="cursor-pointer text-left font-medium hover:text-primary hover:underline focus-visible:underline focus-visible:outline-none">
        {item.caseName}
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
          <SheetHeader className="border-b">
            <div className="flex items-start gap-3 pr-8">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">
                <Scale className="size-5" />
              </span>
              <div className="min-w-0">
                <SheetTitle>{item.caseName}</SheetTitle>
                <SheetDescription className="font-mono text-xs">{item.caseNumber}</SheetDescription>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <StatusBadge status={item.statusCode} label={item.statusName} />
              <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">{item.classificationName}</span>
            </div>
          </SheetHeader>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 border-b p-4 text-sm">
            <Fact icon={Briefcase} label="Project" wide>
              {item.projectName}
            </Fact>
            <Fact icon={UserRound} label="Legal counsel" wide>
              {item.legalCounsel || <span className="text-muted-foreground">No counsel assigned</span>}
            </Fact>
            <Fact icon={CalendarPlus} label="On record since">
              {formatDate(item.createdAt, LONG_DATE)}
            </Fact>
            <Fact icon={History} label="Last updated">
              {formatRelativeDays(item.updatedAt, now)}
            </Fact>
          </dl>

          <section className="flex flex-col gap-2 p-4" aria-labelledby="case-history-heading">
            <h3 id="case-history-heading" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Brief history
            </h3>
            {item.briefHistory ? (
              <p className="rounded-lg border bg-muted/30 p-3 text-sm leading-relaxed whitespace-pre-line">{item.briefHistory}</p>
            ) : (
              <p className="text-sm text-muted-foreground">No history recorded yet.</p>
            )}
          </section>

          {actions && <div className="mt-auto flex justify-end gap-2 border-t p-4">{actions}</div>}
        </SheetContent>
      </Sheet>
    </>
  );
}

function Fact({ icon: Icon, label, wide, children }: { icon: React.ComponentType<{ className?: string }>; label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={wide ? "col-span-2 flex gap-3" : "flex gap-3"}>
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="break-words">{children}</dd>
      </div>
    </div>
  );
}
