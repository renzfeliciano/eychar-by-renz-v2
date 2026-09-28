"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, CircleCheck, Loader2, Printer, RefreshCw, SendHorizontal, Undo2, Wallet } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormError, FormField } from "@/components/shared/form-field";
import { ExportDialog } from "@/components/shared/export-dialog";
import { localDateKey } from "@/lib/date-key";
import { cn } from "@/lib/utils";

type Action = "recompute" | "submit" | "approve" | "return" | "release" | "cancel";

type Props = {
  runId: string;
  runNumber: string;
  organizationId: string;
  status: string;
  canUpdate: boolean;
  canApprove: boolean;
  canRelease: boolean;
  blockingIssues: number;
  employees: number;
  netPayLabel: string;
};

type DialogSpec = {
  action: Action;
  title: string;
  description: string;
  confirmLabel: string;
  busyLabel: string;
  tone: "default" | "destructive";
  fields?: "reason" | "release" | "note";
};

/**
 * The run's next steps, shown only to people who may take them: prepare
 * (recompute, submit, cancel), approve (approve, return) and release. Every
 * step goes through a dialog that says what it does; the ones that need a
 * reason or a payment date ask for it there.
 */
export function RunActions(props: Props) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogSpec | null>(null);
  const [reason, setReason] = useState("");
  const [releasedOn, setReleasedOn] = useState(localDateKey());
  const [paymentReference, setPaymentReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);
  const { status } = props;

  async function run(action: Action, extra: Record<string, unknown> = {}) {
    setBusy(action);
    setError(null);
    const response = await fetch(`/api/payroll-runs/${props.runId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: props.organizationId, action, ...extra }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) {
      const message = body.error ?? "That didn't work. Please try again.";
      if (dialog) setError(message);
      else toast.error(message);
      return false;
    }
    const done: Record<Action, string> = {
      recompute: "Recomputed with the latest attendance and pay terms",
      submit: `${props.runNumber} submitted for approval`,
      approve: `${props.runNumber} approved`,
      return: `${props.runNumber} returned to draft`,
      release: `${props.runNumber} released`,
      cancel: `${props.runNumber} cancelled`,
    };
    toast.success(done[action]);
    setDialog(null);
    router.refresh();
    return true;
  }

  function open(spec: DialogSpec) {
    setReason("");
    setPaymentReference("");
    setReleasedOn(localDateKey());
    setError(null);
    setDialog(spec);
  }

  function confirm() {
    if (!dialog) return;
    if (dialog.fields === "reason") {
      if (reason.trim().length < 3) return setError("Please give a reason.");
      return run(dialog.action, { reason: reason.trim() });
    }
    if (dialog.fields === "release") return run("release", { releasedOn, paymentReference: paymentReference.trim() || undefined });
    if (dialog.fields === "note") return run(dialog.action, reason.trim() ? { note: reason.trim() } : {});
    return run(dialog.action);
  }

  const buttons: ReactNode[] = [];
  if (status === "draft" && props.canUpdate) {
    buttons.push(
      <Button key="recompute" size="sm" variant="outline" onClick={() => run("recompute")} disabled={busy !== null} data-testid="payroll-run-recompute">
        {busy === "recompute" ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
        {busy === "recompute" ? "Recomputing…" : "Recompute"}
      </Button>,
      <Button
        key="submit"
        size="sm"
        disabled={busy !== null || props.blockingIssues > 0}
        title={props.blockingIssues > 0 ? "Fix the blocking issues first" : undefined}
        onClick={() =>
          open({
            action: "submit",
            title: `Submit ${props.runNumber} for approval?`,
            description: `It's recomputed with the latest attendance first, then locked for review: ${props.employees} employees, ${props.netPayLabel} net pay.`,
            confirmLabel: "Submit for approval",
            busyLabel: "Submitting…",
            tone: "default",
            fields: "note",
          })
        }
        data-testid="payroll-run-submit"
      >
        <SendHorizontal className="size-3.5" />
        Submit for approval
      </Button>,
    );
  }
  if ((status === "submitted" || status === "approved") && props.canApprove) {
    buttons.push(
      <Button
        key="return"
        size="sm"
        variant="outline"
        onClick={() =>
          open({
            action: "return",
            title: `Return ${props.runNumber} to draft?`,
            description: "Whoever prepared it can then correct and recompute it. Say what needs fixing.",
            confirmLabel: "Return to draft",
            busyLabel: "Returning…",
            tone: "default",
            fields: "reason",
          })
        }
        data-testid="payroll-run-return"
      >
        <Undo2 className="size-3.5" />
        Return
      </Button>,
    );
  }
  if (status === "submitted" && props.canApprove) {
    buttons.push(
      <Button
        key="approve"
        size="sm"
        onClick={() =>
          open({
            action: "approve",
            title: `Approve ${props.runNumber}?`,
            description: `${props.employees} employees, ${props.netPayLabel} net pay. After approval it can be released once paid.`,
            confirmLabel: "Approve",
            busyLabel: "Approving…",
            tone: "default",
            fields: "note",
          })
        }
        data-testid="payroll-run-approve"
      >
        <CircleCheck className="size-3.5" />
        Approve
      </Button>,
    );
  }
  if (status === "approved" && props.canRelease) {
    buttons.push(
      <Button
        key="release"
        size="sm"
        onClick={() =>
          open({
            action: "release",
            title: `Release ${props.runNumber}?`,
            description: "Marks the payroll as paid and locks it for good. Corrections after this go into the next payroll.",
            confirmLabel: "Release",
            busyLabel: "Releasing…",
            tone: "default",
            fields: "release",
          })
        }
        data-testid="payroll-run-release"
      >
        <Wallet className="size-3.5" />
        Release
      </Button>,
    );
  }

  const canCancel = (status === "draft" || status === "submitted") && props.canUpdate;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canCancel && (
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground hover:text-destructive"
          onClick={() =>
            open({
              action: "cancel",
              title: `Cancel ${props.runNumber}?`,
              description: "The run stays on record as cancelled, and its period is free for a new run. This can't be undone.",
              confirmLabel: "Cancel run",
              busyLabel: "Cancelling…",
              tone: "destructive",
              fields: "reason",
            })
          }
          data-testid="payroll-run-cancel"
        >
          <Ban className="size-3.5" />
          Cancel run
        </Button>
      )}
      <Link href={`/payroll/${props.runId}/payslips`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))} data-testid="payroll-run-payslips">
        <Printer className="size-3.5" />
        Payslips
      </Link>
      <ExportDialog
        title={`Export ${props.runNumber}`}
        description="The payroll register, one row per employee with a totals row, plus a contributions sheet with employee and employer shares for remittance."
        testIdPrefix="payroll-run-export"
        targets={{
          xlsx: { href: `/api/payroll-runs/${props.runId}/export?organizationId=${props.organizationId}&format=xlsx` },
          csv: { href: `/api/payroll-runs/${props.runId}/export?organizationId=${props.organizationId}&format=csv` },
        }}
      />
      {buttons}

      <Dialog open={dialog !== null} onOpenChange={(next) => !next && busy === null && setDialog(null)}>
        <DialogContent className="sm:max-w-md">
          {dialog && (
            <>
              <DialogHeader>
                <DialogTitle>{dialog.title}</DialogTitle>
                <DialogDescription>{dialog.description}</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-4">
                {dialog.fields === "reason" && (
                  <FormField label="Reason" htmlFor="payroll-run-reason" required>
                    <Textarea
                      id="payroll-run-reason"
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder={dialog.action === "cancel" ? "e.g. Prepared with the wrong cutoff dates" : "e.g. Add Carlos's overtime for Oct 12"}
                      rows={3}
                    />
                  </FormField>
                )}
                {dialog.fields === "note" && (
                  <FormField label="Note (optional)" htmlFor="payroll-run-note">
                    <Textarea id="payroll-run-note" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Includes the holiday pay for Oct 10" rows={2} />
                  </FormField>
                )}
                {dialog.fields === "release" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FormField label="Paid on" htmlFor="payroll-run-released-on" required>
                      <Input id="payroll-run-released-on" type="date" value={releasedOn} onChange={(event) => setReleasedOn(event.target.value)} />
                    </FormField>
                    <FormField label="Payment reference" htmlFor="payroll-run-payment-reference">
                      <Input id="payroll-run-payment-reference" value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="e.g. BDO batch 1020" />
                    </FormField>
                  </div>
                )}
                <FormError message={error} />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialog(null)} disabled={busy !== null}>
                  Back
                </Button>
                <Button variant={dialog.tone} onClick={confirm} disabled={busy !== null} data-testid="payroll-run-dialog-confirm">
                  {busy && <Loader2 className="size-3.5 animate-spin" />}
                  {busy ? dialog.busyLabel : dialog.confirmLabel}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
