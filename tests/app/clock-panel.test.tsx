// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { startAuthentication } from "@simplewebauthn/browser";
import { ClockPanel } from "@/app/(self-service)/clock/clock-panel";
import type { ClockSite } from "@/domains/attendance/clock-site-service";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

// The real camera needs getUserMedia + a WASM face model — stubbed to a
// button that "passes" the liveness check, so these tests cover the clock
// flow's own decisions (project, geofence pre-check, payload), not MediaPipe.
vi.mock("@/app/(self-service)/clock/liveness-camera", () => ({
  preloadFaceLandmarker: vi.fn(),
  LivenessCamera: ({ onCaptured }: { onCaptured: (capture: { photo: string; challenges: string[] }) => void }) => (
    <button onClick={() => onCaptured({ photo: "data:image/jpeg;base64,/9j/4AAQ", challenges: ["turn_left", "blink"] })}>
      Pass liveness
    </button>
  ),
}));

vi.mock("@simplewebauthn/browser", () => ({
  startAuthentication: vi.fn().mockResolvedValue({ id: "credential" }),
  startRegistration: vi.fn(),
}));

const SITE: ClockSite = {
  projectId: "6aaa6e9b05c8d5e8411848aa",
  projectName: "Ayala Tower Fit-out",
  locationId: "6aaa6e9b05c8d5e8411848bb",
  locationName: "Makati Site",
  latitude: 14.5547,
  longitude: 121.0244,
  radiusMeters: 100,
};

function mockPosition(position: { latitude: number; longitude: number; accuracy?: number } | { denied: true }) {
  const getCurrentPosition = vi.fn((success: PositionCallback, failure?: PositionErrorCallback | null) => {
    if ("denied" in position) {
      failure?.({ code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: "denied" } as GeolocationPositionError);
      return;
    }
    success({ coords: { accuracy: 10, ...position } } as GeolocationPosition);
  });
  Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition }, configurable: true });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  refresh.mockReset();
  fetchMock = vi.fn(async (url: string) => {
    if (url.includes("/webauthn/challenge")) return new Response(JSON.stringify({ challenge: "abc" }), { status: 200 });
    return new Response(JSON.stringify({ record: {} }), { status: 201 });
  });
  vi.stubGlobal("fetch", fetchMock);
});

describe("ClockPanel", () => {
  it("pre-selects the assigned project and shows its site radius", () => {
    render(<ClockPanel today={null} hasCredential sites={[SITE]} defaultProjectId={SITE.projectId} />);

    expect(screen.getByTestId("clock-project-select")).toHaveTextContent("Ayala Tower Fit-out");
    expect(screen.getByTestId("clock-site-hint")).toHaveTextContent("Makati Site · you need to be within 100 m");
  });

  it("stops before the face check when the employee is outside the site's radius", async () => {
    mockPosition({ latitude: SITE.latitude + 0.0018, longitude: SITE.longitude });
    render(<ClockPanel today={null} hasCredential sites={[SITE]} defaultProjectId={SITE.projectId} />);

    await userEvent.click(screen.getByTestId("clock-in-button"));

    expect(await screen.findByRole("alert")).toHaveTextContent("You're 200 m from Makati Site. You need to be within 100 m to clock in.");
    expect(screen.queryByText("Pass liveness")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("explains a blocked location permission instead of failing silently", async () => {
    mockPosition({ denied: true });
    render(<ClockPanel today={null} hasCredential sites={[SITE]} defaultProjectId={SITE.projectId} />);

    await userEvent.click(screen.getByTestId("clock-in-button"));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Location access is blocked/);
  });

  it("goes location → live face check → biometric, then submits everything the server needs", async () => {
    mockPosition({ latitude: SITE.latitude, longitude: SITE.longitude, accuracy: 8 });
    render(<ClockPanel today={null} hasCredential sites={[SITE]} defaultProjectId={SITE.projectId} />);

    await userEvent.click(screen.getByTestId("clock-in-button"));
    await userEvent.click(await screen.findByText("Pass liveness"));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const clockInCall = fetchMock.mock.calls.find(([url]) => url === "/api/self-service/attendance/clock-in");
    expect(JSON.parse(clockInCall![1].body)).toEqual({
      latitude: SITE.latitude,
      longitude: SITE.longitude,
      accuracy: 8,
      projectId: SITE.projectId,
      photo: "data:image/jpeg;base64,/9j/4AAQ",
      liveness: { challenges: ["turn_left", "blink"] },
      webAuthn: { id: "credential" },
    });
    // @simplewebauthn/browser v11+ takes the server's options wrapped as { optionsJSON }.
    expect(startAuthentication).toHaveBeenCalledWith({ optionsJSON: { challenge: "abc" } });
  });

  it("pins clock-out to the project clocked in at", async () => {
    mockPosition({ latitude: SITE.latitude, longitude: SITE.longitude });
    render(
      <ClockPanel
        today={{ checkInAt: new Date().toISOString(), checkOutAt: null, status: "present", projectId: SITE.projectId, projectName: SITE.projectName }}
        hasCredential
        sites={[SITE]}
      />,
    );

    expect(screen.queryByTestId("clock-project-select")).not.toBeInTheDocument();
    expect(screen.getByTestId("clock-out-site")).toHaveTextContent("Clocking out fromAyala Tower Fit-out");

    await userEvent.click(screen.getByTestId("clock-out-button"));
    await userEvent.click(await screen.findByText("Pass liveness"));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const clockOutCall = fetchMock.mock.calls.find(([url]) => url === "/api/self-service/attendance/clock-out");
    expect(JSON.parse(clockOutCall![1].body).projectId).toBeUndefined();
  });

  it("shows an on-the-clock status with time worked, and makes Clock Out the primary action", () => {
    render(
      <ClockPanel
        today={{ checkInAt: "2026-09-29T01:05:00.000Z", checkOutAt: null, status: "present", projectId: SITE.projectId, projectName: SITE.projectName }}
        hasCredential
        sites={[SITE]}
        nowIso="2026-09-29T03:20:00.000Z"
      />,
    );

    expect(screen.getByTestId("clock-status")).toHaveTextContent("On the clock");
    expect(screen.getByTestId("clock-status")).toHaveTextContent("2h 15m so far");
    expect(screen.getByTestId("clock-out-button").className).toMatch(/(^| )bg-primary( |$)/);
  });

  it("lists the checks as waiting before the employee starts", () => {
    render(<ClockPanel today={null} hasCredential sites={[SITE]} defaultProjectId={SITE.projectId} />);

    const checks = screen.getByRole("list", { name: "What clocking in checks" });
    expect(checks.querySelectorAll('[data-state="waiting"]')).toHaveLength(3);
    expect(screen.getByTestId("clock-status")).toHaveTextContent("Not clocked in");
  });

  it("tells the employee when no clock-in sites exist yet", () => {
    render(<ClockPanel today={null} hasCredential sites={[]} />);

    expect(screen.getByTestId("clock-no-sites")).toHaveTextContent("No clock-in sites are set up yet");
    expect(screen.queryByTestId("clock-in-button")).not.toBeInTheDocument();
  });

  it("surfaces the server's own rejection (e.g. its authoritative geofence check)", async () => {
    mockPosition({ latitude: SITE.latitude, longitude: SITE.longitude });
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/webauthn/challenge")) return new Response(JSON.stringify({ challenge: "abc" }), { status: 200 });
      return new Response(JSON.stringify({ error: "You're 150 m from Makati Site. Clock-in is only allowed within 100 m of the site." }), { status: 422 });
    });
    render(<ClockPanel today={null} hasCredential sites={[SITE]} defaultProjectId={SITE.projectId} />);

    await userEvent.click(screen.getByTestId("clock-in-button"));
    await userEvent.click(await screen.findByText("Pass liveness"));

    expect(await screen.findByRole("alert")).toHaveTextContent("You're 150 m from Makati Site");
    expect(refresh).not.toHaveBeenCalled();
  });
});
