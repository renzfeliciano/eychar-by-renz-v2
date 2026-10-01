// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginPage from "@/app/(auth)/login/page";

const push = vi.fn();
const signIn = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next-auth/react", () => ({ signIn: (...args: unknown[]) => signIn(...args) }));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt, className }: { src: string; alt: string; className?: string }) => <img src={src} alt={alt} className={className} />,
}));

function mockPointer(fine: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === "(pointer: fine)" ? fine : false, media: query, addEventListener() {}, removeEventListener() {} }));
}

beforeEach(() => {
  mockPointer(true);
  push.mockReset();
  signIn.mockReset();
});

describe("LoginPage", () => {
  it("signs in with the entered credentials and opens the dashboard", async () => {
    const user = userEvent.setup();
    signIn.mockResolvedValue({ error: null });
    render(<LoginPage />);

    await user.type(screen.getByLabelText("Username or email"), "renzy_admin");
    await user.type(screen.getByLabelText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: /Sign in/ }));

    expect(signIn).toHaveBeenCalledWith("credentials", { login: "renzy_admin", password: "secret", redirect: false });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
  });

  it("says so when the credentials are wrong", async () => {
    const user = userEvent.setup();
    signIn.mockResolvedValue({ error: "CredentialsSignin" });
    render(<LoginPage />);

    await user.type(screen.getByLabelText("Username or email"), "renzy_admin");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: /Sign in/ }));

    expect(await screen.findByText("Invalid username/email or password.")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("explains a locked account and a busy network", async () => {
    const user = userEvent.setup();
    signIn.mockResolvedValueOnce({ error: "locked" }).mockResolvedValueOnce({ error: "rate_limited" });
    render(<LoginPage />);

    await user.type(screen.getByLabelText("Username or email"), "renzy_admin");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: /Sign in/ }));
    expect(await screen.findByText(/This account is locked for 15 minutes/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Sign in/ }));
    expect(await screen.findByText(/Too many sign-in attempts from this network/)).toBeInTheDocument();
  });

  it("asks for the authenticator code when two-factor sign-in is on, then signs in with it", async () => {
    const user = userEvent.setup();
    signIn.mockResolvedValueOnce({ error: "mfa_required" }).mockResolvedValueOnce({ error: "invalid_otp" }).mockResolvedValueOnce({ error: null });
    render(<LoginPage />);

    await user.type(screen.getByLabelText("Username or email"), "renzy_admin");
    await user.type(screen.getByLabelText("Password"), "harbor-lantern-73-mango");
    await user.click(screen.getByRole("button", { name: /Sign in/ }));

    const code = await screen.findByLabelText("Authentication code");
    expect(code).toHaveFocus();
    await user.type(code, "111111");
    await user.click(screen.getByRole("button", { name: /Verify/ }));
    expect(await screen.findByText(/That code didn't work/)).toBeInTheDocument();

    await user.clear(code);
    await user.type(code, "287082");
    await user.click(screen.getByRole("button", { name: /Verify/ }));
    expect(signIn).toHaveBeenLastCalledWith("credentials", { login: "renzy_admin", password: "harbor-lantern-73-mango", otp: "287082", redirect: false });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
  });

  it("lets someone use a recovery code, or go back to the password step", async () => {
    const user = userEvent.setup();
    signIn.mockResolvedValueOnce({ error: "mfa_required" });
    render(<LoginPage />);

    await user.type(screen.getByLabelText("Username or email"), "renzy_admin");
    await user.type(screen.getByLabelText("Password"), "harbor-lantern-73-mango");
    await user.click(screen.getByRole("button", { name: /Sign in/ }));

    await user.click(await screen.findByRole("button", { name: "Use a recovery code instead" }));
    expect(screen.getByLabelText("Recovery code")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Back/ }));
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("warns when Caps Lock is on while typing the password", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByLabelText("Password"));
    expect(screen.queryByText("Caps Lock is on")).not.toBeInTheDocument();
    await user.keyboard("{CapsLock}a");
    expect(screen.getByText("Caps Lock is on")).toBeInTheDocument();
  });

  it("puts the cursor in the username field on a device with a mouse", () => {
    mockPointer(true);
    render(<LoginPage />);
    expect(screen.getByLabelText("Username or email")).toHaveFocus();
  });

  it("doesn't focus the username on a touchscreen, so the keyboard doesn't pop up and scroll the page past the headline", () => {
    mockPointer(false);
    render(<LoginPage />);
    expect(screen.getByLabelText("Username or email")).not.toHaveFocus();
  });

  it("explains who can help when someone can't sign in", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    const toggle = screen.getByRole("button", { name: "Trouble signing in?" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/HR administrator can unlock it or reset your password/)).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/HR administrator can unlock it or reset your password/)).toBeInTheDocument();
  });

  it("shows an authorized-use notice", () => {
    render(<LoginPage />);
    expect(screen.getByText("Authorized users only. Sign-in activity is monitored and recorded.")).toBeInTheDocument();
  });

  it("lets people jump to a background photo", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    expect(screen.getByRole("button", { name: "Show photo 1 of 6" })).toHaveAttribute("aria-current", "true");
    await user.click(screen.getByRole("button", { name: "Show photo 3 of 6" }));
    expect(screen.getByRole("button", { name: "Show photo 3 of 6" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: "Show photo 1 of 6" })).not.toHaveAttribute("aria-current");
    // The progress segments already show the position; no "01 / 06" counter.
    expect(screen.queryByText(/\d{2} \/ \d{2}/)).not.toBeInTheDocument();
  });

  it("explains an idle sign-out when sent back here for inactivity", async () => {
    window.history.pushState({}, "", "/login?reason=idle");
    render(<LoginPage />);
    expect(await screen.findByRole("status")).toHaveTextContent("You were signed out after a period of inactivity. Sign in again to continue.");
    window.history.pushState({}, "", "/login");
  });
});
