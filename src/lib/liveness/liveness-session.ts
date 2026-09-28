import type { LivenessChallenge } from "@/shared/validation/attendance";

/**
 * Pure, frame-by-frame liveness logic for the self-service clock (ADR-026),
 * kept free of MediaPipe/DOM so it's unit-testable without a camera. The
 * React side (LivenessCamera) turns each video frame into a FaceFrame and
 * feeds it here.
 *
 * What this defends against: holding up a printed/on-screen photo (it can't
 * blink or turn on cue) and replaying a pre-recorded clip (the challenge
 * order and turn direction are randomized per attempt). It runs in the
 * browser, so it raises the bar rather than being tamper-proof — see
 * ADR-026's consequences.
 */

export type FaceFrame = {
  faceCount: number;
  /** 0.5 = facing the camera; higher = turned toward the subject's own left. */
  yawRatio: number | null;
  /** 0 = eyes wide open, 1 = fully shut. */
  eyesClosedScore: number | null;
};

export type LivenessPhase = "no_face" | "multiple_faces" | "challenge" | "center" | "done";

export type LivenessState = {
  phase: LivenessPhase;
  current: LivenessChallenge | null;
  completed: number;
  total: number;
};

const EYES_OPEN_BELOW = 0.3;
const EYES_CLOSED_ABOVE = 0.5;
const TURN_THRESHOLD = 0.15;
const TURN_HOLD_FRAMES = 3;
const CENTER_TOLERANCE = 0.1;
const CENTER_HOLD_FRAMES = 5;

const NOSE_TIP = 1;
const CHEEK_A = 234;
const CHEEK_B = 454;

export const CHALLENGE_INSTRUCTIONS: Record<LivenessChallenge, string> = {
  blink: "Blink slowly",
  turn_left: "Turn your head to your left",
  turn_right: "Turn your head to your right",
};

/** One blink plus one head turn — random direction, random order (4 possible sequences). */
export function pickChallenges(random: () => number = Math.random): LivenessChallenge[] {
  const turn: LivenessChallenge = random() < 0.5 ? "turn_left" : "turn_right";
  return random() < 0.5 ? [turn, "blink"] : ["blink", turn];
}

/**
 * Where the nose tip sits between the two cheek edges, in the RAW camera
 * frame (MediaPipe sees the unmirrored video, not the mirrored preview).
 * In that frame the subject's own left side is image-right, so turning to
 * their left moves the nose toward larger x — a higher ratio.
 */
export function yawRatio(landmarks: ReadonlyArray<{ x: number }>): number {
  const nose = landmarks[NOSE_TIP]?.x;
  const a = landmarks[CHEEK_A]?.x;
  const b = landmarks[CHEEK_B]?.x;
  if (nose === undefined || a === undefined || b === undefined) return 0.5;
  const left = Math.min(a, b);
  const width = Math.max(a, b) - left;
  if (width < 1e-6) return 0.5;
  return Math.min(1, Math.max(0, (nose - left) / width));
}

export function eyesClosedScore(categories: ReadonlyArray<{ categoryName: string; score: number }>): number | null {
  const left = categories.find((category) => category.categoryName === "eyeBlinkLeft")?.score;
  const right = categories.find((category) => category.categoryName === "eyeBlinkRight")?.score;
  if (left === undefined || right === undefined) return null;
  return (left + right) / 2;
}

function isCentered(frame: FaceFrame): boolean {
  return frame.yawRatio !== null && Math.abs(frame.yawRatio - 0.5) <= CENTER_TOLERANCE;
}

function areEyesOpen(frame: FaceFrame): boolean {
  return frame.eyesClosedScore !== null && frame.eyesClosedScore < EYES_OPEN_BELOW;
}

function isTurned(frame: FaceFrame, challenge: "turn_left" | "turn_right"): boolean {
  if (frame.yawRatio === null) return false;
  return challenge === "turn_left" ? frame.yawRatio > 0.5 + TURN_THRESHOLD : frame.yawRatio < 0.5 - TURN_THRESHOLD;
}

export function createLivenessSession(challenges: LivenessChallenge[]) {
  let completed = 0;
  // blink: must see open → closed → open, so a still photo of closed eyes can't pass.
  let blinkStage: "await_open" | "await_close" | "await_reopen" = "await_open";
  let turnHold = 0;
  let centerHold = 0;

  function resetProgress() {
    completed = 0;
    blinkStage = "await_open";
    turnHold = 0;
    centerHold = 0;
  }

  function state(phase: LivenessPhase): LivenessState {
    return { phase, current: challenges[completed] ?? null, completed, total: challenges.length };
  }

  function completeCurrent() {
    completed += 1;
    blinkStage = "await_open";
    turnHold = 0;
  }

  return {
    feed(frame: FaceFrame): LivenessState {
      if (frame.faceCount === 0) {
        turnHold = 0;
        centerHold = 0;
        return state(completed >= challenges.length ? "center" : "no_face");
      }
      if (frame.faceCount > 1) {
        resetProgress();
        return state("multiple_faces");
      }

      if (completed >= challenges.length) {
        centerHold = isCentered(frame) && areEyesOpen(frame) ? centerHold + 1 : 0;
        return state(centerHold >= CENTER_HOLD_FRAMES ? "done" : "center");
      }

      const current = challenges[completed];
      if (current === "blink") {
        const score = frame.eyesClosedScore;
        if (blinkStage === "await_open" && areEyesOpen(frame)) blinkStage = "await_close";
        else if (blinkStage === "await_close" && score !== null && score > EYES_CLOSED_ABOVE) blinkStage = "await_reopen";
        else if (blinkStage === "await_reopen" && areEyesOpen(frame)) completeCurrent();
      } else {
        turnHold = isTurned(frame, current) ? turnHold + 1 : 0;
        if (turnHold >= TURN_HOLD_FRAMES) completeCurrent();
      }

      return state(completed >= challenges.length ? "center" : "challenge");
    },
  };
}
