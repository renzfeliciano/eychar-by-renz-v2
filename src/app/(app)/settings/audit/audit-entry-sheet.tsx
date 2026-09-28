"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export type AuditEntryView = {
  id: string;
  when: string;
  actorName: string;
  actionLabel: string;
  action: string;
  resourceType: string;
  resourceId: string;
  before: unknown;
  after: unknown;
  metadata: unknown;
};

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {/* Rendered as text, never as HTML: whatever was stored is shown literally. */}
      <pre className="max-h-72 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">{JSON.stringify(value, null, 2)}</pre>
    </section>
  );
}

/** "Details" on an audit row: who, what, when, and the stored before/after values. */
export function AuditEntrySheet({ entry }: { entry: AuditEntryView }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-medium text-primary hover:underline">
        Details
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-lg">
          <SheetHeader className="border-b">
            <SheetTitle>{entry.actionLabel}</SheetTitle>
            <SheetDescription>
              {entry.actorName} · {entry.when}
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-4 p-4">
            <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Action code</dt>
              <dd className="font-mono text-xs break-all">{entry.action}</dd>
              <dt className="text-muted-foreground">Record type</dt>
              <dd>{entry.resourceType}</dd>
              <dt className="text-muted-foreground">Record ID</dt>
              <dd className="font-mono text-xs break-all">{entry.resourceId}</dd>
            </dl>
            <JsonBlock title="Before" value={entry.before} />
            <JsonBlock title="After" value={entry.after} />
            <JsonBlock title="Details" value={entry.metadata} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
