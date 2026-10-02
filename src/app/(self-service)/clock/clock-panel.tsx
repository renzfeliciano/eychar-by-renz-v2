"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { Fingerprint, MapPin, Loader2, CheckCircle2, ScanFace, Building2 , LogIn, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormError } from "@/components/shared/form-field";
import { clockCheckStates, type ClockFlowStep, formatWorkedDuration, type ClockCheckState } from "@/domains/attendance/clock-progress";
import { cn } from "@/lib/utils";
import { describeWebAuthnError } from "@/lib/webauthn-error-message";
import { evaluateGeofence, formatDistance } from "@/domains/attendance/geofence";
import type { ClockSite } from "@/domains/attendance/clock-site-service";
import { LivenessCamera, preloadFaceLandmarker, type LivenessCapture } from "./liveness-camera";
import { formatTime } from "@/lib/app-time";

export type TodayRecord = {
  checkInAt?: string | null;
  checkOutAt?: string | null;
  status?: string;
  projectId?: string | null;
  projectName?: string | null;
} | null;

type Action = "clock-in" | "clock-out";
type Step = ClockFlowStep;
type Position = { latitude: number; longitude: number; accuracy: number };

const BUSY_LABEL: Partial<Record<Step, string>> = {
  locating: "Checking your location…",
  biometric: "Confirm with your device's biometric…",
  submitting: "Recording…",
};

function getPosition(): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("This browser can't share your location, which clock-in requires."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy }),
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(new Error("Location access is blocked. Allow location for this site in your browser settings — it's how clock-in confirms you're at the site."));
        } else if (error.code === error.TIMEOUT) {
          reject(new Error("Getting your location took too long. Step somewhere with a clearer view of the sky and try again."));
        } else {
          reject(new Error("Your location couldn't be determined. Turn on location services and try again."));
        }
      },
      // A fresh fix every time — a cached position from earlier could be from somewhere else entirely.
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  });
}

const CHECKS = [
  { key: "location", label: "At the site", icon: MapPin },
  { key: "face", label: "Live face check", icon: ScanFace },
  { key: "biometric", label: "Biometric", icon: Fingerprint },
] as const;
const CHECK_STATE_LABEL: Record<ClockCheckState, string> = { waiting: "(waiting)", active: "(in progress)", done: "(done)" };

async function readError(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => ({}));
  return body.error ?? fallback;
}

export function ClockPanel({
  today,
  hasCredential: initialHasCredential,
  sites,
  defaultProjectId,
  nowIso,
}: {
  today: TodayRecord;
  hasCredential: boolean;
  sites: ClockSite[];
  defaultProjectId?: string;
  /** Server render time, for "time worked so far" without a client clock read during render. */
  nowIso?: string;
}) {
  const router = useRouter();
  const [hasCredential, setHasCredential] = useState(initialHasCredential);
  const [isRegistering, setIsRegistering] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState(defaultProjectId ?? (sites.length === 1 ? sites[0].projectId : ""));
  // Filled before the camera opens, read once the liveness capture comes back.
  const pendingRef = useRef<{ action: Action; position: Position; projectId?: string } | null>(null);

  const hasCheckedIn = Boolean(today?.checkInAt);
  const hasCheckedOut = Boolean(today?.checkOutAt);
  const action: Action = hasCheckedIn ? "clock-out" : "clock-in";
  // Clock-out is pinned to the project clocked in at; only an HR-recorded
  // check-in (no project on it) needs the employee to pick one.
  const needsProjectChoice = !hasCheckedIn || !today?.projectId;
  const effectiveProjectId = needsProjectChoice ? selectedProjectId : today?.projectId ?? "";
  const site = sites.find((candidate) => candidate.projectId === effectiveProjectId);

  async function handleRegisterBiometric() {
    setError(null);
    setIsRegistering(true);
    try {
      const optionsResponse = await fetch("/api/self-service/webauthn/register/options", { method: "POST" });
      if (!optionsResponse.ok) throw new Error(await readError(optionsResponse, "Could not start registration."));
      const options = await optionsResponse.json();

      let registrationResponse;
      try {
        registrationResponse = await startRegistration({ optionsJSON: options });
      } catch (webAuthnError) {
        // The browser/OS throws its own error here (often a vague, spec-quoting
        // NotAllowedError) — translate it instead of showing that to the user.
        throw new Error(describeWebAuthnError(webAuthnError, "registration"));
      }

      const verifyResponse = await fetch("/api/self-service/webauthn/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registrationResponse),
      });
      if (!verifyResponse.ok) throw new Error(await readError(verifyResponse, "Could not verify registration."));

      setHasCredential(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Biometric setup failed or was cancelled.");
    } finally {
      setIsRegistering(false);
    }
  }

  async function startClock() {
    setError(null);
    preloadFaceLandmarker();
    if (needsProjectChoice && !selectedProjectId) {
      setError("Select the project you're working at today.");
      return;
    }

    setStep("locating");
    try {
      const position = await getPosition();
      // Same rule the server enforces — checked here first so nobody sits
      // through the face check and biometric just to be turned away.
      if (site) {
        const geofence = evaluateGeofence(position, site);
        if (!geofence.withinRadius) {
          const accuracyHint =
            position.accuracy > site.radiusMeters
              ? ` Your location is only accurate to about ±${formatDistance(position.accuracy)} right now — turning on precise location or stepping outdoors may help.`
              : "";
          throw new Error(
            `You're ${formatDistance(geofence.distanceMeters)} from ${site.locationName}. You need to be within ${formatDistance(site.radiusMeters)} to ${action === "clock-in" ? "clock in" : "clock out"}.${accuracyHint}`,
          );
        }
      }
      pendingRef.current = { action, position, projectId: needsProjectChoice ? selectedProjectId : undefined };
      setStep("liveness");
    } catch (err) {
      setStep("idle");
      setError(err instanceof Error ? err.message : "Couldn't check your location. Try again.");
    }
  }

  async function finishClock(capture: LivenessCapture) {
    const pending = pendingRef.current;
    if (!pending) return;
    try {
      setStep("biometric");
      const challengeResponse = await fetch("/api/self-service/webauthn/challenge", { method: "POST" });
      if (!challengeResponse.ok) throw new Error(await readError(challengeResponse, "Could not start biometric confirmation."));
      const challengeOptions = await challengeResponse.json();
      let webAuthn;
      try {
        webAuthn = await startAuthentication({ optionsJSON: challengeOptions });
      } catch (webAuthnError) {
        throw new Error(describeWebAuthnError(webAuthnError, "authentication"));
      }

      setStep("submitting");
      const response = await fetch(`/api/self-service/attendance/${pending.action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...pending.position,
          projectId: pending.projectId,
          photo: capture.photo,
          liveness: { challenges: capture.challenges },
          webAuthn,
        }),
      });
      if (!response.ok) throw new Error(await readError(response, "Failed to record attendance."));

      setStep("idle");
      router.refresh();
    } catch (err) {
      setStep("idle");
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      pendingRef.current = null;
    }
  }

  if (!hasCredential) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Fingerprint className="size-4" />
            Set up biometric verification
          </CardTitle>
          <CardDescription>
            Before you can clock in/out, confirm it&apos;s really you using this device&apos;s Face ID, fingerprint, or screen lock.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <FormError message={error} />
          <Button onClick={handleRegisterBiometric} data-testid="register-biometric-button" icon={Fingerprint} pending={isRegistering} pendingLabel="Setting up…">
            Set up biometric verification
          </Button>
        </CardContent>
      </Card>
    );
  }

  const isBusy = step !== "idle";
  const checkStates = clockCheckStates(step);
  const noSites = sites.length === 0 && needsProjectChoice;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Attendance</CardTitle>
        <div className="mt-1 flex items-start gap-2.5" data-testid="clock-status">
          <span
            className={cn(
              "mt-1.5 size-2 shrink-0 rounded-full",
              hasCheckedOut ? "bg-muted-foreground" : hasCheckedIn ? "bg-success ring-4 ring-success/15" : "bg-warning ring-4 ring-warning/15",
            )}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-sm font-medium">{hasCheckedOut ? "Done for today" : hasCheckedIn ? "On the clock" : "Not clocked in"}</p>
            <CardDescription>
              {hasCheckedOut
                ? `${formatTime(today!.checkInAt!)} – ${formatTime(today!.checkOutAt!)} · ${formatWorkedDuration(today!.checkInAt!, today!.checkOutAt!)} worked`
                : hasCheckedIn
                  ? `Since ${formatTime(today!.checkInAt!)}${today?.projectName ? ` · ${today.projectName}` : ""}${nowIso ? ` · ${formatWorkedDuration(today!.checkInAt!, nowIso)} so far` : ""}`
                  : "Clock in when you arrive at your site."}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {hasCheckedOut ? (
          <p className="flex items-center gap-2 text-sm text-success">
            <CheckCircle2 className="size-4" />
            Checked out at {formatTime(today!.checkOutAt!)}
          </p>
        ) : step === "liveness" ? (
          <LivenessCamera
            onCaptured={finishClock}
            onCancel={() => {
              pendingRef.current = null;
              setStep("idle");
            }}
          />
        ) : noSites ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground" data-testid="clock-no-sites">
            No clock-in sites are set up yet. Ask HR to add a location with coordinates to your project.
          </p>
        ) : (
          <>
            {needsProjectChoice ? (
              <div className="flex flex-col gap-1.5">
                <Label>Project</Label>
                <Select value={selectedProjectId || null} onValueChange={(value) => setSelectedProjectId(value ?? "")} disabled={isBusy}>
                  <SelectTrigger className="w-full" data-testid="clock-project-select">
                    <SelectValue>{sites.find((candidate) => candidate.projectId === selectedProjectId)?.projectName ?? "Select where you're working today"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {sites.map((candidate) => (
                      <SelectItem key={candidate.projectId} value={candidate.projectId}>
                        {candidate.projectName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2.5" data-testid="clock-out-site">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground ring-1 ring-border" aria-hidden="true">
                  <Building2 className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Clocking out from</p>
                  <p className="truncate text-sm font-medium">{today?.projectName ?? "your clock-in site"}</p>
                </div>
              </div>
            )}

            {site && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="clock-site-hint">
                <MapPin className="size-3.5 shrink-0" />
                {site.locationName} · you need to be within {formatDistance(site.radiusMeters)}
              </p>
            )}

            {isBusy && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
                {step === "biometric" ? <Fingerprint className="size-4 animate-pulse" /> : <Loader2 className="size-4 animate-spin" />}
                {BUSY_LABEL[step]}
              </p>
            )}

            <FormError message={error} />

            <Button
              onClick={startClock}
              disabled={isBusy || (needsProjectChoice && !selectedProjectId)}
              size="lg"
              icon={action === "clock-in" ? LogIn : LogOut}
              pending={isBusy}
              pendingLabel={action === "clock-in" ? "Clocking in…" : "Clocking out…"}
              data-testid={action === "clock-in" ? "clock-in-button" : "clock-out-button"}
            >
              {action === "clock-in" ? "Clock In" : "Clock Out"}
            </Button>

            <ol className="grid grid-cols-3 gap-2 text-center text-[0.7rem]" aria-label="What clocking in checks">
              {CHECKS.map(({ key, label, icon: Icon }) => {
                const state = checkStates[key];
                return (
                  <li
                    key={key}
                    data-state={state}
                    aria-current={state === "active" ? "step" : undefined}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-lg border px-2 py-2 transition-colors",
                      state === "waiting" && "border-transparent bg-muted/50 text-muted-foreground",
                      state === "active" && "border-primary/30 bg-primary/5 font-medium text-primary",
                      state === "done" && "border-success/25 bg-success/5 text-success",
                    )}
                  >
                    {state === "done" ? <CheckCircle2 className="size-4" aria-hidden="true" /> : <Icon className={cn("size-4", state === "active" && "animate-pulse")} aria-hidden="true" />}
                    {label}
                    <span className="sr-only">{CHECK_STATE_LABEL[state]}</span>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </CardContent>
    </Card>
  );
}
