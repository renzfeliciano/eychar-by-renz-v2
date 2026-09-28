// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChangePasswordForm } from "@/components/shared/change-password-form";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

async function fill(user: ReturnType<typeof userEvent.setup>, current: string, next: string, confirm: string) {
  await user.type(screen.getByLabelText(/Current password/), current);
  await user.type(screen.getByLabelText(/^New password/), next);
  await user.type(screen.getByLabelText(/Confirm new password/), confirm);
}

describe("ChangePasswordForm", () => {
  it("shows the rules as they're met", async () => {
    const user = userEvent.setup();
    render(<ChangePasswordForm onChanged={vi.fn()} />);
    const rule = screen.getByText("At least 12 characters");
    expect(rule.closest("li")).toHaveAttribute("data-met", "false");
    await user.type(screen.getByLabelText(/^New password/), "harbor-lantern-73");
    expect(rule.closest("li")).toHaveAttribute("data-met", "true");
  });

  it("won't submit when the confirmation doesn't match", async () => {
    const user = userEvent.setup();
    render(<ChangePasswordForm onChanged={vi.fn()} />);
    await fill(user, "old-temp-pass", "harbor-lantern-73-mango", "harbor-lantern-73-mangx");
    await user.click(screen.getByRole("button", { name: /Change password/ }));
    expect(await screen.findByText("The new passwords don't match.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("saves and reports success, or shows the server's reason", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Your current password is incorrect." }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    render(<ChangePasswordForm onChanged={onChanged} />);
    await fill(user, "old-temp-pass", "harbor-lantern-73-mango", "harbor-lantern-73-mango");

    await user.click(screen.getByRole("button", { name: /Change password/ }));
    expect(await screen.findByText("Your current password is incorrect.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Change password/ }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/account/password",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ currentPassword: "old-temp-pass", newPassword: "harbor-lantern-73-mango" }) }),
    );
  });
});
