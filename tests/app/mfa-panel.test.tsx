// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MfaPanel } from "@/app/(app)/account/security/mfa-panel";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const fetchMock = vi.fn();
const reply = (body: unknown, ok = true) => ({ ok, json: async () => body });
beforeEach(() => {
  refresh.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const CODES = ["KX4TQ-9MBW2", "AB2CD-EF3GH", "JK4LM-NP5QR", "ST6UV-WX7YZ", "A2B3C-D4E5F", "G6H7J-K2L3M", "N4P5Q-R6S7T", "U2V3W-X4Y5Z", "B7C2D-E3F4G", "H5J6K-L7M2N"];

describe("MfaPanel", () => {
  it("walks through turning two-step verification on and shows the recovery codes once", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(reply({ secret: "JBSWY3DPEHPK3PXP", qrCode: "data:image/png;base64,AAAA" })).mockResolvedValueOnce(reply({ recoveryCodes: CODES }));
    render(<MfaPanel enabled={false} enabledAt={null} recoveryCodesLeft={0} />);

    await user.click(screen.getByRole("button", { name: /Turn on two-step verification/ }));
    const passwordDialog = await screen.findByRole("dialog");
    await user.type(within(passwordDialog).getByLabelText(/Password/), "harbor-lantern-73-mango");
    await user.click(within(passwordDialog).getByRole("button", { name: "Continue" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/account/mfa", expect.objectContaining({ body: JSON.stringify({ action: "start", password: "harbor-lantern-73-mango" }) }));
    const dialog = await screen.findByRole("dialog", { name: "Set up two-step verification" });
    expect(within(dialog).getByRole("img", { name: /QR code/ })).toHaveAttribute("src", "data:image/png;base64,AAAA");
    expect(within(dialog).getByText("JBSW Y3DP EHPK 3PXP")).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText(/6-digit code/), "287082");
    await user.click(within(dialog).getByRole("button", { name: /Verify and turn on/ }));

    expect(await within(dialog).findByText("KX4TQ-9MBW2")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith("/api/account/mfa", expect.objectContaining({ body: JSON.stringify({ action: "confirm", code: "287082" }) }));

    await user.click(within(dialog).getByRole("button", { name: /I've saved my codes/ }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("shows the state when it's on, and turns it off with the password", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(reply({ ok: true }));
    render(<MfaPanel enabled enabledAt="2026-09-01T00:00:00.000Z" recoveryCodesLeft={7} />);

    expect(screen.getByText("On")).toBeInTheDocument();
    expect(screen.getByText(/7 of 10 recovery codes left/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Turn off" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/Password/), "harbor-lantern-73-mango");
    await user.click(within(dialog).getByRole("button", { name: /Turn off two-step verification/ }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/account/mfa", expect.objectContaining({ body: JSON.stringify({ action: "disable", password: "harbor-lantern-73-mango" }) }));
  });
});
