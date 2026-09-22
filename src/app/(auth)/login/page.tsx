"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Building, Loader2, ShieldCheck, Eye, EyeOff, UserRound, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField, FormError } from "@/components/shared/form-field";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { cn } from "@/lib/utils";
import { LoginVisual } from "./login-visual";

export default function LoginPage() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
    // Mobile-first: the base layout is the photo panel as a full-bleed
    // backdrop (absolutely positioned) behind a centered card — the whole
    // experience on a phone, same as PCAS's own mobile behavior. At lg+ the
    // photo panel rejoins the flex row as its own half instead.
    <main className="relative flex min-h-screen flex-col lg:flex-row">
      <div className="absolute top-4 right-4 z-20 rounded-full border bg-background/70 shadow-[var(--shadow-soft)] backdrop-blur-sm">
        <ThemeToggle />
      </div>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center p-4 py-12 lg:bg-background lg:p-8">
        <div
          className="pointer-events-none absolute top-1/2 left-1/2 hidden size-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-3xl lg:block"
          aria-hidden="true"
        />

        <Card
          className={cn(
            "relative w-full max-w-sm animate-in fade-in slide-in-from-bottom-4 border shadow-[var(--shadow-glow)] backdrop-blur-xl duration-500",
            "bg-[color-mix(in_oklch,var(--card)_94%,transparent)]",
          )}
        >
          <CardHeader className="items-center text-center">
            <div className="mb-1 flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[var(--shadow-glow)]">
              <Building className="size-5" aria-hidden="true" />
            </div>
            <span className="text-sm font-semibold tracking-tight">WorkforceHub</span>
            <p className="mt-3 text-[0.65rem] font-semibold tracking-widest text-muted-foreground uppercase">Workforce management platform</p>
            <CardTitle className="text-xl">Welcome back</CardTitle>
            <CardDescription>Sign in to manage your workforce operations</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4" aria-label="Sign in">
              <FormField label="Username or email" htmlFor="login">
                <div className="relative">
                  <UserRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id="login"
                    type="text"
                    required
                    autoComplete="username"
                    placeholder="e.g. jdelacruz"
                    value={login}
                    onChange={(event) => setLogin(event.target.value)}
                    className="pl-9"
                    data-testid="login-username-input"
                  />
                </div>
              </FormField>

              <FormField label="Password" htmlFor="password">
                <div className="relative">
                  <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="pr-9 pl-9"
                    data-testid="login-password-input"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    data-testid="login-toggle-password-visibility"
                  >
                    {showPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                  </button>
                </div>
              </FormField>

              <FormError message={error} />

              <Button type="submit" disabled={isSubmitting} className="mt-1 w-full" data-testid="login-submit-button">
                {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                {isSubmitting ? "Signing in…" : "Sign in"}
              </Button>

              <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="size-3.5" aria-hidden="true" />
                Access is protected by role-based permissions
              </p>
            </form>
          </CardContent>
        </Card>

        <p className="relative mt-6 text-xs text-primary-foreground/70 lg:text-muted-foreground">
          © {new Date().getFullYear()} WorkforceHub. All rights reserved.
        </p>
      </div>

      <LoginVisual className="absolute inset-0 z-0 lg:static lg:z-auto lg:w-1/2" />
    </main>
  );
}
