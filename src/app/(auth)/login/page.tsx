"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Building, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField, FormError } from "@/components/shared/form-field";

export default function LoginPage() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const result = await signIn("credentials", { login, password, redirect: false });

    setIsSubmitting(false);

    if (result?.error) {
      setError("Invalid username/email or password.");
      return;
    }

    router.push("/dashboard");
  }

  return (
    // The gradient wash + glass card is deliberately reserved for this one
    // "first impression" screen (and the Dashboard hero) rather than
    // applied everywhere — used sparingly, it reads as a considered detail
    // instead of noise competing with the data-dense pages behind login.
    <main className="bg-gradient-brand flex min-h-screen items-center justify-center p-4">
      <Card className="glass-surface w-full max-w-sm border shadow-[var(--shadow-glow)]">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-[var(--shadow-glow)]">
            <Building className="size-5" aria-hidden="true" />
          </div>
          <CardTitle className="text-xl">WorkforceHub</CardTitle>
          <CardDescription>Sign in to your organization</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4" aria-label="Sign in">
            <FormField label="Username or email" htmlFor="login">
              <Input
                id="login"
                type="text"
                required
                autoComplete="username"
                value={login}
                onChange={(event) => setLogin(event.target.value)}
                data-testid="login-username-input"
              />
            </FormField>

            <FormField label="Password" htmlFor="password">
              <Input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                data-testid="login-password-input"
              />
            </FormField>

            <FormError message={error} />

            <Button type="submit" disabled={isSubmitting} className="mt-1 w-full" data-testid="login-submit-button">
              {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
