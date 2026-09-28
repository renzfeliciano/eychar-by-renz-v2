import { describe, it, expect } from "vitest";
import {
  pickChallenges,
  yawRatio,
  eyesClosedScore,
  createLivenessSession,
  type FaceFrame,
} from "@/lib/liveness/liveness-session";

// Landmark 1 = nose tip, 234/454 = the two cheek edges. x is in the RAW
// (unmirrored) camera frame, where the subject's own left side is image-right.
function landmarksWithNoseAt(noseX: number) {
  const landmarks = Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  landmarks[234] = { x: 0.3, y: 0.5, z: 0 };
  landmarks[454] = { x: 0.7, y: 0.5, z: 0 };
  landmarks[1] = { x: noseX, y: 0.5, z: 0 };
  return landmarks;
}

const CENTER: FaceFrame = { faceCount: 1, yawRatio: 0.5, eyesClosedScore: 0.05 };
const EYES_CLOSED: FaceFrame = { ...CENTER, eyesClosedScore: 0.8 };
const TURNED_TO_SUBJECTS_LEFT: FaceFrame = { ...CENTER, yawRatio: 0.8 };
const TURNED_TO_SUBJECTS_RIGHT: FaceFrame = { ...CENTER, yawRatio: 0.2 };
const NO_FACE: FaceFrame = { faceCount: 0, yawRatio: null, eyesClosedScore: null };
const TWO_FACES: FaceFrame = { ...CENTER, faceCount: 2 };

function feedMany(session: ReturnType<typeof createLivenessSession>, frame: FaceFrame, times: number) {
  let state = session.feed(frame);
  for (let i = 1; i < times; i++) state = session.feed(frame);
  return state;
}

describe("pickChallenges", () => {
  it("always asks for one blink plus one head turn", () => {
    for (const value of [0, 0.3, 0.6, 0.99]) {
      const challenges = pickChallenges(() => value);
      expect(challenges).toHaveLength(2);
      expect(challenges).toContain("blink");
      expect(challenges.some((challenge) => challenge === "turn_left" || challenge === "turn_right")).toBe(true);
    }
  });

  it("randomizes both the turn direction and the order", () => {
    const sequences = new Set<string>();
    for (const [a, b] of [[0.1, 0.1], [0.1, 0.9], [0.9, 0.1], [0.9, 0.9]]) {
      const values = [a, b];
      sequences.add(pickChallenges(() => values.shift()!).join(","));
    }
    expect(sequences.size).toBe(4);
  });
});

describe("yawRatio", () => {
  it("is ~0.5 when facing the camera", () => {
    expect(yawRatio(landmarksWithNoseAt(0.5))).toBeCloseTo(0.5);
  });

  it("rises toward 1 as the subject turns to their own left (nose moves image-right in the raw frame)", () => {
    expect(yawRatio(landmarksWithNoseAt(0.62))).toBeCloseTo(0.8);
  });

  it("doesn't depend on which cheek landmark happens to be further left", () => {
    const landmarks = landmarksWithNoseAt(0.62);
    [landmarks[234], landmarks[454]] = [landmarks[454], landmarks[234]];
    expect(yawRatio(landmarks)).toBeCloseTo(0.8);
  });
});

describe("eyesClosedScore", () => {
  it("averages the two eye-blink blendshapes", () => {
    expect(
      eyesClosedScore([
        { categoryName: "eyeBlinkLeft", score: 0.6 },
        { categoryName: "eyeBlinkRight", score: 0.8 },
        { categoryName: "jawOpen", score: 0.1 },
      ]),
    ).toBeCloseTo(0.7);
  });

  it("is null when the blendshapes are missing", () => {
    expect(eyesClosedScore([])).toBeNull();
  });
});

describe("createLivenessSession", () => {
  it("passes after a blink, the requested turn, and then facing the camera again", () => {
    const session = createLivenessSession(["blink", "turn_left"]);

    expect(session.feed(CENTER)).toMatchObject({ phase: "challenge", current: "blink" });
    session.feed(EYES_CLOSED);
    expect(session.feed(CENTER)).toMatchObject({ phase: "challenge", current: "turn_left", completed: 1 });
    expect(feedMany(session, TURNED_TO_SUBJECTS_LEFT, 3)).toMatchObject({ phase: "center" });
    expect(feedMany(session, CENTER, 5)).toMatchObject({ phase: "done", completed: 2 });
  });

  it("doesn't accept a turn in the wrong direction", () => {
    const session = createLivenessSession(["turn_right", "blink"]);
    expect(feedMany(session, TURNED_TO_SUBJECTS_LEFT, 10)).toMatchObject({ phase: "challenge", current: "turn_right", completed: 0 });
    expect(feedMany(session, TURNED_TO_SUBJECTS_RIGHT, 3)).toMatchObject({ current: "blink", completed: 1 });
  });

  it("doesn't count a blink unless the eyes were open first (a photo with closed eyes can't pass)", () => {
    const session = createLivenessSession(["blink", "turn_left"]);
    expect(feedMany(session, EYES_CLOSED, 10)).toMatchObject({ current: "blink", completed: 0 });
  });

  it("needs the turn held for a few frames, not a single jittery frame", () => {
    const session = createLivenessSession(["turn_left", "blink"]);
    session.feed(TURNED_TO_SUBJECTS_LEFT);
    expect(session.feed(CENTER)).toMatchObject({ current: "turn_left", completed: 0 });
  });

  it("pauses without losing progress when the face leaves the frame", () => {
    const session = createLivenessSession(["blink", "turn_left"]);
    session.feed(CENTER);
    session.feed(EYES_CLOSED);
    session.feed(CENTER);
    expect(session.feed(NO_FACE)).toMatchObject({ phase: "no_face", completed: 1 });
    expect(session.feed(CENTER)).toMatchObject({ phase: "challenge", current: "turn_left", completed: 1 });
  });

  it("starts over when a second face appears, so someone else can't do the challenge", () => {
    const session = createLivenessSession(["blink", "turn_left"]);
    session.feed(CENTER);
    session.feed(EYES_CLOSED);
    session.feed(CENTER);
    expect(session.feed(TWO_FACES)).toMatchObject({ phase: "multiple_faces", completed: 0 });
    expect(session.feed(CENTER)).toMatchObject({ phase: "challenge", current: "blink", completed: 0 });
  });

  it("won't finish while the person is still turned away or has their eyes shut", () => {
    const session = createLivenessSession(["turn_left", "blink"]);
    feedMany(session, TURNED_TO_SUBJECTS_LEFT, 3);
    session.feed(CENTER);
    session.feed(EYES_CLOSED);
    session.feed(CENTER);
    expect(feedMany(session, TURNED_TO_SUBJECTS_LEFT, 10)).toMatchObject({ phase: "center" });
    expect(feedMany(session, EYES_CLOSED, 10)).toMatchObject({ phase: "center" });
    expect(feedMany(session, CENTER, 5)).toMatchObject({ phase: "done" });
  });
});
