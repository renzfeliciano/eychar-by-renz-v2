"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Download, KeyRound, Loader2, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormError, FormField } from "@/components/shared/form-field";
import { StatusBadge } from "@/components/shared/status-badge";

type Setup = { secret: string; qrCode: string };

async function post(body: unknown): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  const response = await fetch("/api/account/mfa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  return response.ok ? { ok: true, data } : { ok: false, error: data.error ?? "Something went wrong. Please try again." };
}

/** "JBSWY3DPEHPK3PXP" → "JBSW Y3DP EHPK 3PXP", easier to type into an app by hand. */
const groupKey = (secret: string) => secret.match(/.{1,4}/g)?.join(" ") ?? secret;

function RecoveryCodes({ codes }: { codes: string[] }) {
  const text = codes.join("\n");
  return (
    <div className="flex flex-col gap-3">
      <ol className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-lg border bg-muted/40 p-4 font-mono text-sm tabular-nums">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ol>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void navigator.clipboard?.writeText(text);
            toast.success("Recovery codes copied");
          }}
        >
          <Copy className="size-3.5" aria-hidden="true" />
          Copy
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            const url = URL.createObjectURL(new Blob([`WorkforceHub recovery codes\nEach code works once.\n\n${text}\n`], { type: "text/plain" }));
            const link = Object.assign(document.createElement("a"), { href: url, download: "workforcehub-recovery-codes.txt" });
            link.click();
            URL.revokeObjectURL(url);
          }}
        >
          <Download className="size-3.5" aria-hidden="true" />
          Download
        </Button>
      </div>
    </div>
  );
}

/** Scan, prove it works with a code, then save the recovery codes. */
function EnrollDialog({ setup, onCancel, onDone }: { setup: Setup; onCancel: () => void; onDone: () => void }) {
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await post({ action: "confirm", code });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setCodes(result.data.recoveryCodes as string[]);
  }

  return (
    // Once the codes are showing, only "I've saved my codes" closes it.
    <Dialog open onOpenChange={(open) => !open && !codes && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{codes ? "Save your recovery codes" : "Set up two-step verification"}</DialogTitle>
          <DialogDescription>
            {codes
              ? "If you lose your phone, each of these codes signs you in once. Keep them somewhere safe; they won't be shown again."
              : "Use an authenticator app such as Google Authenticator, Microsoft Authenticator or 1Password."}
          </DialogDescription>
        </DialogHeader>

        {codes ? (
          <>
            <RecoveryCodes codes={codes} />
            <DialogFooter>
              <Button type="button" onClick={onDone}>
                I&apos;ve saved my codes
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={confirm} className="flex flex-col gap-4">
            <ol className="flex flex-col gap-4 text-sm">
              <li className="flex flex-col gap-3">
                <span>
                  <span className="font-medium">1. Scan this QR code</span> with your authenticator app.
                </span>
                <div className="flex items-center gap-4">
                  {/* A data URL made on the server; there's nothing for next/image to optimize. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={setup.qrCode} alt="QR code for your authenticator app" width={148} height={148} className="rounded-lg border bg-white p-1" />
                  <div className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
                    <span>Can&apos;t scan? Enter this key instead:</span>
                    <code className="rounded-md border bg-muted/50 px-2 py-1 font-mono text-[13px] break-all text-foreground">{groupKey(setup.secret)}</code>
                  </div>
                </div>
              </li>
              <li className="flex flex-col gap-2">
                <span>
                  <span className="font-medium">2. Enter the code</span> the app shows.
                </span>
                <FormField label="6-digit code" htmlFor="mfa-code" required>
                  <Input
                    id="mfa-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                    placeholder="123456"
                    className="w-40 font-medium tracking-[0.3em] tabular-nums"
                  />
                </FormField>
              </li>
            </ol>
            <FormError message={error} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || code.length !== 6}>
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="size-4" aria-hidden="true" />}
                {busy ? "Verifying…" : "Verify and turn on"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Asks for the account password before a sensitive change; can show a result in place of the form. */
function PasswordConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  busyLabel,
  destructive,
  onConfirm,
  result,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  busyLabel: string;
  destructive?: boolean;
  /** Returns an error message, or null on success. */
  onConfirm: (password: string) => Promise<string | null>;
  result?: React.ReactNode;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const problem = await onConfirm(password);
    setBusy(false);
    if (problem) setError(problem);
    else setPassword("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {result ?? (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <FormField label="Password" htmlFor="mfa-confirm-password" required>
              <Input id="mfa-confirm-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your account password" />
            </FormField>
            <FormError message={error} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={busy || !password}>
                {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                {busy ? busyLabel : confirmLabel}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The Security page's two-step verification card body. */
export function MfaPanel({ enabled, enabledAt, recoveryCodesLeft }: { enabled: boolean; enabledAt: string | null; recoveryCodesLeft: number }) {
  const router = useRouter();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [starting, setStarting] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);

  async function startEnrollment() {
    setStarting(true);
    const result = await post({ action: "start" });
    setStarting(false);
    if (!result.ok) return toast.error(result.error);
    setSetup(result.data as Setup);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`flex size-10 items-center justify-center rounded-lg ${enabled ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`} aria-hidden="true">
          {enabled ? <ShieldCheck className="size-5" /> : <Smartphone className="size-5" />}
        </span>
        <div className="flex min-w-0 flex-1 basis-64 flex-col">
          <span className="flex items-center gap-2 font-medium">
            Authenticator app <StatusBadge status={enabled ? "active" : "inactive"} label={enabled ? "On" : "Off"} tone={enabled ? "success" : "neutral"} />
          </span>
          <span className="text-sm text-muted-foreground">
            {enabled
              ? `${enabledAt ? `On since ${new Date(enabledAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}` : "On"} · ${recoveryCodesLeft} of 10 recovery codes left`
              : "Sign-in asks for a code from your phone as well as your password, so a stolen password alone isn't enough."}
          </span>
        </div>
        {enabled ? (
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setRegenerating(true)}>
              <KeyRound className="size-3.5" aria-hidden="true" />
              New recovery codes
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setDisabling(true)}>
              <ShieldOff className="size-3.5" aria-hidden="true" />
              Turn off
            </Button>
          </div>
        ) : (
          <Button type="button" onClick={startEnrollment} disabled={starting}>
            {starting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="size-4" aria-hidden="true" />}
            {starting ? "Preparing…" : "Turn on two-step verification"}
          </Button>
        )}
      </div>

      {setup && (
        <EnrollDialog
          setup={setup}
          onCancel={() => setSetup(null)}
          onDone={() => {
            setSetup(null);
            toast.success("Two-step verification is on");
            router.refresh();
          }}
        />
      )}

      <PasswordConfirmDialog
        open={disabling}
        onOpenChange={setDisabling}
        title="Turn off two-step verification?"
        description="Sign-in will only ask for your password. Enter it to confirm."
        confirmLabel="Turn off two-step verification"
        busyLabel="Turning off…"
        destructive
        onConfirm={async (password) => {
          const result = await post({ action: "disable", password });
          if (!result.ok) return result.error;
          setDisabling(false);
          toast.success("Two-step verification is off");
          router.refresh();
          return null;
        }}
      />

      <PasswordConfirmDialog
        open={regenerating}
        onOpenChange={(open) => {
          setRegenerating(open);
          if (!open && newCodes) {
            setNewCodes(null);
            router.refresh();
          }
        }}
        title={newCodes ? "Your new recovery codes" : "Get new recovery codes?"}
        description={newCodes ? "Your old codes no longer work. Save these somewhere safe; they won't be shown again." : "Your current codes will stop working. Enter your password to confirm."}
        confirmLabel="Get new codes"
        busyLabel="Generating…"
        onConfirm={async (password) => {
          const result = await post({ action: "regenerate-recovery-codes", password });
          if (!result.ok) return result.error;
          setNewCodes(result.data.recoveryCodes as string[]);
          return null;
        }}
        result={newCodes ? <RecoveryCodes codes={newCodes} /> : undefined}
      />
    </div>
  );
}
