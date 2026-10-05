"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { ArrowLeft, ArrowRight, CheckCircle2, Eye, Loader2, RotateCcw, ScanFace, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CHALLENGE_INSTRUCTIONS,
  createLivenessSession,
  eyesClosedScore,
  pickChallenges,
  yawRatio,
  type LivenessState,
} from "@/lib/liveness/liveness-session";
import { routeMediaPipeInfoLogs } from "@/lib/liveness/mediapipe-console";
import type { LivenessChallenge } from "@/shared/validation/attendance";

export type LivenessCapture = { photo: string; challenges: LivenessChallenge[] };

const WASM_PATH = "/mediapipe/wasm";
const MODEL_PATH = "/mediapipe/models/face_landmarker.task";
const TIMEOUT_MS = 45_000;
const PHOTO_MAX_WIDTH = 640;

// Loaded once per page and reused (clock-in then clock-out, or a retry) —
// the WASM runtime + model are ~15 MB and take a few seconds to initialize.
let landmarkerPromise: Promise<FaceLandmarker> | null = null;

function getFaceLandmarker(): Promise<FaceLandmarker> {
  landmarkerPromise ??= (async () => {
    routeMediaPipeInfoLogs();
    const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
    const options = (delegate: "GPU" | "CPU") => ({
      baseOptions: { modelAssetPath: MODEL_PATH, delegate },
      runningMode: "VIDEO" as const,
      // 2, not 1: detecting a second face is how "someone else in frame" is caught.
      numFaces: 2,
      outputFaceBlendshapes: true,
    });
    try {
      return await FaceLandmarker.createFromOptions(fileset, options("GPU"));
    } catch {
      return FaceLandmarker.createFromOptions(fileset, options("CPU"));
    }
  })().catch((error) => {
    landmarkerPromise = null;
    throw error;
  });
  return landmarkerPromise;
}

/**
 * Starts the model download/compile in the background (a cold load measured
 * ~12 s on a dev server) so it's usually ready by the time the location
 * check finishes. Failures are swallowed here — the camera step retries and
 * reports them properly.
 */
export function preloadFaceLandmarker(): void {
  getFaceLandmarker().catch(() => undefined);
}

function describeCameraError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera access was blocked. Allow the camera for this site in your browser settings, then try again.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No front camera was found on this device.";
  if (name === "NotReadableError") return "Your camera is being used by another app. Close it and try again.";
  return "The camera couldn't start. Try again.";
}

/** The raw (unmirrored) frame — the record should show the scene as it was, not a selfie-mirror of it. */
function capturePhoto(video: HTMLVideoElement): string {
  const scale = Math.min(1, PHOTO_MAX_WIDTH / video.videoWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8);
}

function Instruction({ state }: { state: LivenessState }) {
  if (state.phase === "no_face") return <><ScanFace className="size-4" /> Center your face in the frame</>;
  if (state.phase === "multiple_faces") return <><Users className="size-4" /> Only you should be in the frame</>;
  if (state.phase === "center" || state.phase === "done") return <><CheckCircle2 className="size-4" /> Now look straight at the camera</>;
  const current = state.current;
  if (!current) return null;
  // The preview is mirrored, so the person's own left is also screen-left.
  const Icon = current === "blink" ? Eye : current === "turn_left" ? ArrowLeft : ArrowRight;
  return <><Icon className="size-4" /> {CHALLENGE_INSTRUCTIONS[current]}</>;
}

type Status = "starting" | "running" | "failed";

export function LivenessCamera({ onCaptured, onCancel }: { onCaptured: (capture: LivenessCapture) => void; onCancel: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<Status>("starting");
  const [failure, setFailure] = useState<string | null>(null);
  const [livenessState, setLivenessState] = useState<LivenessState | null>(null);
  // Always calls the latest onCaptured without restarting the camera effect when the parent re-renders.
  const handleCaptured = useEffectEvent((capture: LivenessCapture) => onCaptured(capture));

  const retry = useCallback(() => {
    setFailure(null);
    setLivenessState(null);
    setStatus("starting");
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let frameHandle = 0;
    let timeoutHandle = 0;

    function stopEverything() {
      cancelAnimationFrame(frameHandle);
      window.clearTimeout(timeoutHandle);
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
    }

    function fail(message: string) {
      if (cancelled) return;
      stopEverything();
      setFailure(message);
      setStatus("failed");
    }

    (async () => {
      // Started now, awaited after the camera is up — the two load in parallel.
      const landmarkerLoad = getFaceLandmarker();
      landmarkerLoad.catch(() => undefined);

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
      } catch (error) {
        fail(describeCameraError(error));
        return;
      }
      if (cancelled) return stopEverything();

      const video = videoRef.current;
      if (!video) return stopEverything();
      video.srcObject = stream;
      await video.play().catch(() => undefined);

      let landmarker: FaceLandmarker;
      try {
        landmarker = await landmarkerLoad;
      } catch {
        fail("The face check couldn't load. Check your connection and try again.");
        return;
      }
      if (cancelled) return stopEverything();

      const challenges = pickChallenges();
      const session = createLivenessSession(challenges);
      setStatus("running");
      timeoutHandle = window.setTimeout(() => fail("We didn't catch that in time. Make sure your face is well lit, then try again."), TIMEOUT_MS);

      let lastVideoTime = -1;
      let lastKey = "";
      const tick = () => {
        if (cancelled) return;
        if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
          lastVideoTime = video.currentTime;
          const result = landmarker.detectForVideo(video, performance.now());
          const faceCount = result.faceLandmarks.length;
          const state = session.feed({
            faceCount,
            yawRatio: faceCount ? yawRatio(result.faceLandmarks[0]) : null,
            eyesClosedScore: result.faceBlendshapes[0] ? eyesClosedScore(result.faceBlendshapes[0].categories) : null,
          });

          const key = `${state.phase}:${state.completed}`;
          if (key !== lastKey) {
            lastKey = key;
            setLivenessState(state);
          }
          if (state.phase === "done") {
            const photo = capturePhoto(video);
            stopEverything();
            handleCaptured({ photo, challenges });
            return;
          }
        }
        frameHandle = requestAnimationFrame(tick);
      };
      frameHandle = requestAnimationFrame(tick);
    })();

    return () => {
      cancelled = true;
      stopEverything();
    };
  }, [attempt]);

  const phase = livenessState?.phase;
  const ringClass =
    phase === "multiple_faces"
      ? "border-destructive"
      : phase === "center" || phase === "done"
        ? "border-success"
        : phase === "challenge"
          ? "border-primary"
          : "border-white/60";

  return (
    <div className="flex flex-col gap-3" data-testid="liveness-camera">
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-black sm:aspect-[4/3]">
        <video ref={videoRef} muted playsInline className="size-full -scale-x-100 object-cover" aria-label="Live camera preview" />
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute top-1/2 left-1/2 aspect-[3/4] w-[58%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-[3px] border-dashed transition-colors duration-300 sm:w-[40%]",
            ringClass,
          )}
        />

        {status === "starting" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 text-sm text-white">
            <Loader2 className="size-6 animate-spin" />
            Starting camera and face check…
          </div>
        )}

        {status === "failed" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/75 p-6 text-center text-sm text-white" role="alert">
            {failure}
            <Button size="sm" variant="secondary" onClick={retry} data-testid="liveness-retry-button">
              <RotateCcw className="size-3.5" />
              Try again
            </Button>
          </div>
        )}

        {status === "running" && livenessState && (
          <div className="absolute inset-x-3 bottom-3 flex flex-col items-center gap-2">
            <p
              aria-live="polite"
              className="flex items-center gap-2 rounded-full bg-black/65 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm"
              data-testid="liveness-instruction"
            >
              <Instruction state={livenessState} />
            </p>
            <div className="flex gap-1.5" aria-label={`Step ${Math.min(livenessState.completed + 1, livenessState.total)} of ${livenessState.total}`}>
              {Array.from({ length: livenessState.total }, (_, index) => (
                <span
                  key={index}
                  className={cn("h-1.5 w-6 rounded-full transition-colors", index < livenessState.completed ? "bg-success" : "bg-white/40")}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        A live check that it&apos;s really you — your photo is taken automatically at the end. Nothing is analyzed off your device.
      </p>
      <Button variant="ghost" onClick={onCancel} data-testid="liveness-cancel-button" icon={X}>
        Cancel
      </Button>
    </div>
  );
}
