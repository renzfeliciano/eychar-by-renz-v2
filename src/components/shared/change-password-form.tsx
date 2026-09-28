"use client";

import { useState, type FormEvent } from "react";
import { Check, Circle, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormError, FormField } from "@/components/shared/form-field";
import { PASSWORD_MIN_LENGTH, checkPassword } from "@/shared/validation/password-policy";
import { cn } from "@/lib/utils";

/**
 * Current password, new password twice, and the rules shown live as they're
 * met. Used by the forced change after a temporary password and by the
 * Security page. The server re-checks everything, including the username rule.
 */
export function ChangePasswordForm({ onChanged, submitLabel = "Change password" }: { onChanged: () => void; submitLabel?: string }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const problems = checkPassword(newPassword);
  const rules = [
    { label: `At least ${PASSWORD_MIN_LENGTH} characters`, met: newPassword.length >= PASSWORD_MIN_LENGTH },
    { label: "Not a common or easily guessed password", met: newPassword.length > 0 && !problems.some((problem) => problem.includes("too common") || problem.includes("repeating")) },
    { label: "Different from your current password", met: newPassword.length > 0 && newPassword !== currentPassword },
  ];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (problems.length > 0) {
      setError(problems[0]);
      return;
    }
    if (newPassword !== confirm) {
      setError("The new passwords don't match.");
      return;
    }
    setIsSubmitting(true);
    const response = await fetch("/api/account/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setIsSubmitting(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Couldn't change the password. Please try again.");
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirm("");
    onChanged();
  }

  const type = visible ? "text" : "password";

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4" aria-label="Change password">
      <FormField label="Current password" htmlFor="current-password" required>
        <Input id="current-password" type={type} autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Your current or temporary password" />
      </FormField>
      <FormField label="New password" htmlFor="new-password" required>
        <div className="relative">
          <Input
            id="new-password"
            type={type}
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="e.g. harbor-lantern-73-mango"
            className="pr-10"
            aria-describedby="password-rules"
          />
          <button
            type="button"
            onClick={() => setVisible((value) => !value)}
            className="absolute top-1/2 right-1 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={visible ? "Hide passwords" : "Show passwords"}
          >
            {visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
          </button>
        </div>
      </FormField>
      <ul id="password-rules" className="flex flex-col gap-1 rounded-lg border bg-muted/30 px-3 py-2.5 text-xs" aria-label="Password rules">
        {rules.map((rule) => (
          <li key={rule.label} data-met={rule.met} className={cn("flex items-center gap-2", rule.met ? "text-success" : "text-muted-foreground")}>
            {rule.met ? <Check className="size-3.5" aria-hidden="true" /> : <Circle className="size-3" aria-hidden="true" />}
            {rule.label}
          </li>
        ))}
        <li className="pt-1 text-muted-foreground">Tip: a few unrelated words with a number is long, strong and easy to remember.</li>
      </ul>
      <FormField label="Confirm new password" htmlFor="confirm-password" required>
        <Input id="confirm-password" type={type} autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="Type the new password again" />
      </FormField>
      <FormError message={error} />
      <Button type="submit" disabled={isSubmitting} className="self-start">
        {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <KeyRound className="size-4" aria-hidden="true" />}
        {isSubmitting ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
