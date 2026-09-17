"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { Fingerprint, Camera, MapPin, LogIn, LogOut, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export type TodayRecord = {
  checkInAt?: string | null;
  checkOutAt?: string | null;
  status?: string;
} | null;

type Step = "idle" | "location" | "camera" | "biometric" | "submitting" | "error";

const STEP_LABEL: Record<Step, string> = {
  idle: "",
  location: "Getting your location…",
  camera: "Taking a photo…",
  biometric: "Confirm with your device's biometric…",
  submitting: "Recording…",
  error: "",
};

function getLocation(): Promise<{ latitude: number; longitude: number; accuracy: number } | undefined> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(undefined);
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }),
      () => resolve(undefined),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  });
}

async function capturePhoto(videoRef: React.RefObject<HTMLVideoElement | null>): Promise<string | undefined> {
  if (!("mediaDevices" in navigator)) return undefined;
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
  } catch {
    return undefined;
  }

  const video = videoRef.current;
  if (!video) {
    stream.getTracks().forEach((track) => track.stop());
    return undefined;
  }

  video.srcObject = stream;
  await video.play();
  // A freshly-started stream's first frame or two can be black — give the
  // camera a brief moment to actually produce image data before capturing.
  await new Promise((resolve) => setTimeout(resolve, 400));

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 320;
  canvas.height = video.videoHeight || 240;
  canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
  const photo = canvas.toDataURL("image/jpeg", 0.7);

  stream.getTracks().forEach((track) => track.stop());
  video.srcObject = null;

  return photo;
}

export function ClockPanel({ today, hasCredential: initialHasCredential }: { today: TodayRecord; hasCredential: boolean }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasCredential, setHasCredential] = useState(initialHasCredential);
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);

  async function handleRegisterBiometric() {
    setError(null);
    setIsRegistering(true);
    try {
      const optionsResponse = await fetch("/api/self-service/webauthn/register/options", { method: "POST" });
      if (!optionsResponse.ok) throw new Error((await optionsResponse.json().catch(() => ({}))).error ?? "Could not start registration.");
      const options = await optionsResponse.json();

      const registrationResponse = await startRegistration(options);

      const verifyResponse = await fetch("/api/self-service/webauthn/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registrationResponse),
      });
      if (!verifyResponse.ok) throw new Error((await verifyResponse.json().catch(() => ({}))).error ?? "Could not verify registration.");

      setHasCredential(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Biometric setup failed or was cancelled.");
    } finally {
      setIsRegistering(false);
    }
  }

  async function handleClock(action: "clock-in" | "clock-out") {
    setError(null);
    try {
      setStep("location");
      const location = await getLocation();

      setStep("camera");
      const photo = await capturePhoto(videoRef);

      setStep("biometric");
      const challengeResponse = await fetch("/api/self-service/webauthn/challenge", { method: "POST" });
      if (!challengeResponse.ok) throw new Error((await challengeResponse.json().catch(() => ({}))).error ?? "Could not start biometric confirmation.");
      const challengeOptions = await challengeResponse.json();
      const webAuthn = await startAuthentication(challengeOptions);

      setStep("submitting");
      const response = await fetch(`/api/self-service/attendance/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...location, photo, webAuthn }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "Failed to record attendance.");

      setStep("idle");
      router.refresh();
    } catch (err) {
      setStep("error");
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    }
  }

  const isBusy = step !== "idle" && step !== "error";

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
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={handleRegisterBiometric} disabled={isRegistering} data-testid="register-biometric-button">
            {isRegistering ? <Loader2 className="size-4 animate-spin" /> : <Fingerprint className="size-4" />}
            {isRegistering ? "Setting up…" : "Set up biometric verification"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const hasCheckedIn = Boolean(today?.checkInAt);
  const hasCheckedOut = Boolean(today?.checkOutAt);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Attendance</CardTitle>
        <CardDescription>
          {hasCheckedOut
            ? "You're all done for today."
            : hasCheckedIn
              ? `Checked in at ${new Date(today!.checkInAt!).toLocaleTimeString()}`
              : "Not clocked in yet today."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {/* Muted, off-layout video element — only needed as a source for canvas capture, never shown to the user as a live preview. */}
        <video ref={videoRef} muted playsInline className="sr-only" aria-hidden="true" />

        {isBusy && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            {step === "location" && <MapPin className="size-4 animate-pulse" />}
            {step === "camera" && <Camera className="size-4 animate-pulse" />}
            {step === "biometric" && <Fingerprint className="size-4 animate-pulse" />}
            {step === "submitting" && <Loader2 className="size-4 animate-spin" />}
            {STEP_LABEL[step]}
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {hasCheckedOut && (
          <p className="flex items-center gap-2 text-sm text-success">
            <CheckCircle2 className="size-4" />
            Checked out at {new Date(today!.checkOutAt!).toLocaleTimeString()}
          </p>
        )}

        {!hasCheckedIn && (
          <Button onClick={() => handleClock("clock-in")} disabled={isBusy} data-testid="clock-in-button">
            {isBusy ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
            {isBusy ? "Clocking in…" : "Clock In"}
          </Button>
        )}
        {hasCheckedIn && !hasCheckedOut && (
          <Button onClick={() => handleClock("clock-out")} disabled={isBusy} variant="outline" data-testid="clock-out-button">
            {isBusy ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
            {isBusy ? "Clocking out…" : "Clock Out"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
