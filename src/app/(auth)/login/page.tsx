"use client";

import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { ArrowBigUpDash, ArrowLeft, Eye, EyeOff, Info, KeyRound, Lock, ShieldCheck, UserRound, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/shared/form-field";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Logo } from "@/components/shared/logo";
import { LoginVisual } from "./login-visual";
import { signInMessage } from "./sign-in-messages";
import { BrandName } from "@/components/shared/brand-name";
import { BRAND } from "@/lib/brand";

const FIELD_ICON = "pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground";
const FIELD_INPUT = "h-11 rounded-lg bg-background pl-10 md:text-[15px]";

/** Staggered entrance for the card's rows (`.stagger-in`, reduced-motion aware). */
const stagger = (index: number) => ({
  className: "stagger-in",
  style: { "--stagger-index": index } as CSSProperties,
});

export default function LoginPage() {
  const router = useRouter();
  const loginRef = useRef<HTMLInputElement>(null);
  // Focus the username only with a mouse/trackpad. On a touchscreen, focusing
  // opens the keyboard and scrolls the page past the brand and headline.
  useEffect(() => {
    if (window.matchMedia?.("(pointer: fine)").matches) loginRef.current?.focus();
  }, []);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  // Accounts with two-factor sign-in get a second step after the password.
  const [step, setStep] = useState<"password" | "code">("password");
  const [otp, setOtp] = useState("");
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Why the person landed back here (set by the idle guard), shown once above the form.
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get("reason");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the URL on arrival
    if (reason === "idle") setNotice("You were signed out after a period of inactivity. Sign in again to continue.");
    else if (reason === "password-changed") setNotice("Your password was changed, which signed you out everywhere. Sign in with your new password.");
  }, []);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // The button stays in its loading state from the click until the dashboard
  // replaces this page. It only comes back when something stops the sign-in:
  // a wrong password, a locked account, a server error or a dropped connection.
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setError(null);
    setIsSubmitting(true);

    let result: Awaited<ReturnType<typeof signIn>>;
    try {
      result = await signIn("credentials", step === "code" ? { login, password, otp, redirect: false } : { login, password, redirect: false });
    } catch {
      setIsSubmitting(false);
      setError(signInMessage("network"));
      return;
    }

    if (result?.error === "mfa_required") {
      setIsSubmitting(false);
      setStep("code");
      return;
    }
    if (!result || result.error || result.ok === false) {
      setIsSubmitting(false);
      setError(signInMessage(result?.error ?? "server"));
      return;
    }

    router.push("/dashboard");
  }

  function backToPassword() {
    setStep("password");
    setOtp("");
    setUseRecoveryCode(false);
    setError(null);
  }

  function trackCapsLock(event: KeyboardEvent<HTMLInputElement>) {
    setCapsLockOn(event.getModifierState("CapsLock"));
  }

  return (
    // The photo carousel fills the screen at every size. Desktop: the story
    // sits bottom-left on the photo and the sign-in card floats, content
    // height, centered in the right column. Phones: the card rises from the
    // bottom as a sheet under a band of photo.
    // h-dvh + overflow-hidden: the page never scrolls. On a short screen the
    // spacing tightens (the `short`/`shorter` variants, globals.css) so the
    // whole card, footer included, usually fits; below that the card keeps
    // its full height and the column scrolls instead (justify-center-safe
    // stops centering from cropping it). Never let the card itself scroll:
    // that squeezes the footer.
    // dvh so iOS's address bar can't hide the button.
    <main className="relative min-h-dvh bg-neutral-950 lg:h-dvh lg:overflow-hidden">
      <div className="relative grid min-h-dvh grid-rows-[minmax(13.5rem,1fr)_auto] lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_auto] lg:grid-rows-1">
        <LoginVisual />

        <div className="relative z-10 flex min-h-0 flex-col lg:w-[31rem] lg:justify-center-safe lg:overflow-y-auto lg:px-10 lg:py-10 xl:w-[34rem] xl:px-12 xl:py-12 lg:short:py-6 xl:short:py-6 lg:shorter:py-4 xl:shorter:py-4">
          <section
            aria-labelledby="login-title"
            className="flex min-h-0 animate-in flex-col overflow-hidden rounded-t-2xl bg-card lg:shrink-0 shadow-[var(--shadow-modal)] duration-500 ease-out fade-in slide-in-from-bottom-8 lg:max-h-none lg:rounded-xl lg:ring-1 lg:ring-white/15 lg:slide-in-from-bottom-4"
          >
            {/* The card is a plain sheet ruled into three: the header (brand and
                title), the form, and a footer line. No texture or tint: the photo
                beside it carries the atmosphere, the card carries the task. */}
            <div className="relative shrink-0 overflow-hidden border-b px-6 pt-6 pb-6 sm:px-9 sm:pt-8 sm:pb-7 lg:short:pt-6 lg:short:pb-5 lg:shorter:pt-5 lg:shorter:pb-4">
              <div className="relative flex items-center gap-3">
                <Logo className="size-10 rounded-lg p-1" priority />
                <BrandName tagline className="flex-1" />
                <ThemeToggle />
              </div>

              <div className="relative">
                <div {...stagger(1)}>
                  <h1 id="login-title" className="mt-8 text-2xl leading-tight font-semibold tracking-[-0.02em] text-balance sm:text-[1.75rem] lg:short:mt-5 lg:shorter:mt-4">
                    {step === "code" ? "Two-step verification" : "Sign in to your account"}
                  </h1>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {step === "code"
                      ? useRecoveryCode
                        ? "Enter one of the recovery codes you saved when you turned on two-step verification."
                        : "Enter the 6-digit code from your authenticator app."
                      : "Use the username or email your HR team gave you."}
                  </p>
                </div>
              </div>
            </div>

            <div className="relative flex flex-col px-6 pt-6 pb-7 sm:px-9 sm:pt-7 sm:pb-9 lg:short:pt-5 lg:short:pb-6 lg:shorter:pt-4 lg:shorter:pb-5">
              <form onSubmit={handleSubmit} noValidate className="relative flex flex-col gap-5 lg:short:gap-4" aria-label="Sign in">
                {step === "password" ? (
                  <>
                    <div {...stagger(2)}>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="login">Username or email</Label>
                        <div className="relative">
                          <UserRound className={FIELD_ICON} aria-hidden="true" />
                          <Input
                            id="login"
                            type="text"
                            ref={loginRef}
                            required
                            autoComplete="username"
                            autoCapitalize="none"
                            spellCheck={false}
                            placeholder="e.g. jdelacruz"
                            value={login}
                            onChange={(event) => setLogin(event.target.value)}
                            className={FIELD_INPUT}
                            data-testid="login-username-input"
                          />
                        </div>
                      </div>
                    </div>

                    <div {...stagger(3)}>
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-3">
                          <Label htmlFor="password">Password</Label>
                          <button
                            type="button"
                            onClick={() => setShowHelp((value) => !value)}
                            aria-expanded={showHelp}
                            aria-controls="login-help"
                            className="cursor-pointer rounded-sm text-xs font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                          >
                            Trouble signing in?
                          </button>
                        </div>
                        <div className="relative">
                          <Lock className={FIELD_ICON} aria-hidden="true" />
                          <Input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            required
                            autoComplete="current-password"
                            placeholder="Enter your password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            onKeyDown={trackCapsLock}
                            onKeyUp={trackCapsLock}
                            onBlur={() => setCapsLockOn(false)}
                            aria-describedby={capsLockOn ? "login-caps-lock" : undefined}
                            className={`${FIELD_INPUT} pr-11`}
                            data-testid="login-password-input"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((value) => !value)}
                            className="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-[color,background-color] duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                            aria-label={showPassword ? "Hide password" : "Show password"}
                            data-testid="login-toggle-password-visibility"
                          >
                            {showPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                          </button>
                        </div>
                        {capsLockOn && (
                          <p id="login-caps-lock" className="flex animate-in items-center gap-1.5 text-xs font-medium text-warning duration-150 fade-in">
                            <ArrowBigUpDash className="size-3.5" aria-hidden="true" />
                            Caps Lock is on
                          </p>
                        )}
                        {showHelp && (
                          <div
                            id="login-help"
                            className="flex animate-in items-start gap-2.5 rounded-lg border bg-muted/50 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground duration-200 fade-in slide-in-from-top-1"
                          >
                            <Info className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
                            <p>
                              After 5 wrong passwords in a row, the account locks for 15 minutes. Your HR administrator can unlock it or reset your password. Sessions end after a period of inactivity,
                              and signing in on another device ends the older session.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div {...stagger(2)}>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="otp">{useRecoveryCode ? "Recovery code" : "Authentication code"}</Label>
                      <div className="relative">
                        <KeyRound className={FIELD_ICON} aria-hidden="true" />
                        <Input
                          key={useRecoveryCode ? "recovery" : "totp"}
                          id="otp"
                          type="text"
                          required
                          autoFocus
                          inputMode={useRecoveryCode ? "text" : "numeric"}
                          autoComplete="one-time-code"
                          autoCapitalize="characters"
                          spellCheck={false}
                          maxLength={useRecoveryCode ? 11 : 6}
                          placeholder={useRecoveryCode ? "e.g. KX4TQ-9MBW2" : "6-digit code"}
                          value={otp}
                          onChange={(event) => setOtp(useRecoveryCode ? event.target.value : event.target.value.replace(/\D/g, ""))}
                          className={`${FIELD_INPUT} font-medium tracking-[0.25em] tabular-nums placeholder:tracking-normal placeholder:font-normal`}
                          data-testid="login-otp-input"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <button
                          type="button"
                          onClick={backToPassword}
                          className="flex items-center gap-1 rounded-sm font-medium text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          <ArrowLeft className="size-3.5" aria-hidden="true" />
                          Back
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setUseRecoveryCode((value) => !value);
                            setOtp("");
                            setError(null);
                          }}
                          className="rounded-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          {useRecoveryCode ? "Use your authenticator app instead" : "Use a recovery code instead"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {notice && !error && (
                  <p role="status" className="flex items-start gap-2 rounded-lg border bg-muted/50 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                    <Info className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
                    {notice}
                  </p>
                )}
                <FormError message={error} />

                <div {...stagger(4)}>
                  <Button
                    type="submit"
                    icon={step === "code" ? ShieldCheck : LogIn}
                    pending={isSubmitting}
                    pendingLabel={step === "code" ? "Verifying…" : "Signing in…"}
                    className="mt-1 h-11 w-full rounded-lg text-[15px]"
                    data-testid="login-submit-button"
                  >
                    {step === "code" ? "Verify" : "Sign in"}
                  </Button>
                </div>
              </form>
            </div>

            <footer className="relative mt-auto flex shrink-0 items-center gap-2.5 overflow-hidden border-t bg-muted/40 px-6 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] text-xs text-muted-foreground sm:px-9 lg:rounded-b-xl lg:shorter:pt-3">
              <ShieldCheck className="relative size-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="relative">Authorized users only. Sign-in activity is monitored and recorded.</span>
            </footer>
          </section>

          <p className="mt-5 hidden shrink-0 text-center text-xs text-white/60 lg:block lg:short:mt-3">© {new Date().getFullYear()} {BRAND.fullName}. All rights reserved.</p>
        </div>
      </div>
    </main>
  );
}
