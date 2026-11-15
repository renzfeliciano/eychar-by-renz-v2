"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { auditChanges, auditFields, describeRecordType } from "./audit-fields";

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

/** Stored values as labelled lines. Rendered as text, never as HTML: whatever was stored is shown literally. */
function FieldList({ title, value }: { title: string; value: unknown }) {
  const fields = auditFields(value);
  if (fields.length === 0) return null;
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
      <dl className="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 rounded-lg border bg-muted/30 p-3 text-sm">
        {fields.map((field) => (
          <div key={field.label} className="contents">
            <dt className="text-muted-foreground">{field.label}</dt>
            <dd className="break-words whitespace-pre-line">{field.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** For an edit: only the fields that changed, old value beside new. */
function ChangeTable({ before, after }: { before: unknown; after: unknown }) {
  const changes = auditChanges(before, after);
  if (changes.length === 0) return <p className="text-sm text-muted-foreground">No field changed.</p>;
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-[13px] font-semibold text-foreground">What changed</h3>
      <table className="w-full rounded-lg border text-sm" aria-label="What changed">
        <thead>
          <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
            <th className="px-3 py-1.5 text-left font-medium">Field</th>
            <th className="px-3 py-1.5 text-left font-medium">Before</th>
            <th className="px-3 py-1.5 text-left font-medium">After</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((change) => (
            <tr key={change.label} className="border-b align-top last:border-0">
              <td className="px-3 py-1.5 text-muted-foreground">{change.label}</td>
              <td className="px-3 py-1.5 break-words whitespace-pre-line">{change.before}</td>
              <td className="px-3 py-1.5 font-medium break-words whitespace-pre-line">{change.after}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function isRecord(value: unknown): boolean {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** "Details" on an audit row: who, what, when, and the stored values in plain language. */
export function AuditEntrySheet({ entry }: { entry: AuditEntryView }) {
  const [open, setOpen] = useState(false);
  const isChange = isRecord(entry.before) && isRecord(entry.after);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center text-sm font-medium text-primary hover:underline max-md:min-h-10 max-md:px-2">
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
              <dt className="text-muted-foreground">Record</dt>
              <dd>{describeRecordType(entry.resourceType)}</dd>
            </dl>
            {isChange ? (
              <ChangeTable before={entry.before} after={entry.after} />
            ) : (
              <>
                <FieldList title="Before" value={entry.before} />
                <FieldList title="After" value={entry.after} />
              </>
            )}
            <FieldList title="Details" value={entry.metadata} />
            <details className="rounded-lg border bg-muted/30 p-3 text-sm">
              <summary className="cursor-pointer text-[13px] font-semibold text-foreground">Technical reference</summary>
              <p className="mt-1.5 text-xs text-muted-foreground">Only needed if you contact support about this entry.</p>
              <dl className="mt-2 grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-2">
                <dt className="text-muted-foreground">Action code</dt>
                <dd className="font-mono text-xs break-all">{entry.action}</dd>
                <dt className="text-muted-foreground">Record ID</dt>
                <dd className="font-mono text-xs break-all">{entry.resourceId}</dd>
              </dl>
            </details>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
