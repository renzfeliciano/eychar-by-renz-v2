// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountActions } from "@/app/(app)/settings/accounts/account-actions";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const fetchMock = vi.fn();
beforeEach(() => {
  refresh.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const ACCOUNT = { id: "u1", displayName: "Ana Reyes", firstName: "Ana", lastName: "Reyes", kind: "staff" as const, status: "active" as const, locked: true, mfaEnabled: true };

async function openMenuAndPick(user: ReturnType<typeof userEvent.setup>, item: string) {
  await user.click(screen.getByRole("button", { name: "Actions for Ana Reyes" }));
  await user.click(await screen.findByRole("menuitem", { name: item }));
}

describe("AccountActions", () => {
  it("resets the password after confirming, and shows the temporary one once", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ temporaryPassword: "k7qp-3mzx-9rdw-h2tf" }) });
    render(<AccountActions organizationId="org1" account={ACCOUNT} isSelf={false} />);

    await openMenuAndPick(user, "Reset password");
    const confirm = await screen.findByRole("dialog");
    await user.click(within(confirm).getByRole("button", { name: "Reset password" }));

    expect(await screen.findByText("k7qp-3mzx-9rdw-h2tf")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/users/u1", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ organizationId: "org1", action: "reset-password" }) }));
  });

  it("offers unlock only for a locked account and two-step reset only when it's on", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<AccountActions organizationId="org1" account={{ ...ACCOUNT, locked: false, mfaEnabled: false }} isSelf={false} />);
    await user.click(screen.getByRole("button", { name: "Actions for Ana Reyes" }));
    expect(screen.queryByRole("menuitem", { name: "Unlock" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Reset two-step verification" })).not.toBeInTheDocument();
    unmount();
  });

  it("disables an account after confirming", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    render(<AccountActions organizationId="org1" account={ACCOUNT} isSelf={false} />);

    await openMenuAndPick(user, "Disable account");
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Disable account" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/users/u1", expect.objectContaining({ body: JSON.stringify({ organizationId: "org1", action: "disable" }) }));
  });

  it("doesn't let administrators disable themselves", async () => {
    const user = userEvent.setup();
    render(<AccountActions organizationId="org1" account={ACCOUNT} isSelf />);
    await user.click(screen.getByRole("button", { name: "Actions for Ana Reyes" }));
    expect(screen.queryByRole("menuitem", { name: "Disable account" })).not.toBeInTheDocument();
  });

  it("edits a staff account's name", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    render(<AccountActions organizationId="org1" account={ACCOUNT} isSelf={false} />);

    await openMenuAndPick(user, "Edit name");
    const dialog = await screen.findByRole("dialog");
    const first = within(dialog).getByLabelText(/First name/);
    await user.clear(first);
    await user.type(first, "Anabelle");
    await user.click(within(dialog).getByRole("button", { name: "Save name" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/users/u1",
      expect.objectContaining({ body: JSON.stringify({ organizationId: "org1", action: "rename", firstName: "Anabelle", lastName: "Reyes" }) }),
    );
  });

  it("doesn't offer a name edit for an employee's self-service account", async () => {
    const user = userEvent.setup();
    render(<AccountActions organizationId="org1" account={{ ...ACCOUNT, kind: "self-service" }} isSelf={false} />);
    await user.click(screen.getByRole("button", { name: "Actions for Ana Reyes" }));
    expect(screen.queryByRole("menuitem", { name: "Edit name" })).not.toBeInTheDocument();
  });
});
