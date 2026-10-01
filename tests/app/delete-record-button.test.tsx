// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeleteRecordButton } from "@/components/shared/delete-record-button";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const PREVIEW = { label: "Ana Santos", noun: "employee", summary: [{ label: "Employee record", count: 1 }, { label: "Attendance records", count: 14 }], blockers: [] as string[] };

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  push.mockReset();
  fetchMock = vi.fn(async (url: string) =>
    url.startsWith("/api/deletions/preview") ? new Response(JSON.stringify(PREVIEW), { status: 200 }) : new Response(JSON.stringify({ batch: {} }), { status: 201 }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

describe("DeleteRecordButton", () => {
  it("shows what goes with the record, and deletes only once the exact name is typed", async () => {
    const user = userEvent.setup();
    render(<DeleteRecordButton organizationId="org1" type="employee" id="e1" afterDeleteHref="/people" />);

    await user.click(screen.getByRole("button", { name: /Delete/ }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Attendance records")).toBeInTheDocument();
    expect(within(dialog).getByText("14")).toBeInTheDocument();

    const confirm = within(dialog).getByRole("button", { name: "Move to recycle bin" });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/Type Ana Santos to confirm/), "Ana Santos");
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    await waitFor(() => expect(push).toHaveBeenCalledWith("/people"));
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("/api/deletions");
    expect(JSON.parse(init.body)).toEqual({ organizationId: "org1", type: "employee", id: "e1", confirm: "Ana Santos" });
  });

  it("explains why something can't be deleted instead of offering the button", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ ...PREVIEW, blockers: ["Used by 3 job assignments"] }), { status: 200 }));
    render(<DeleteRecordButton organizationId="org1" type="position" id="p1" />);

    await user.click(screen.getByRole("button", { name: /Delete/ }));
    const dialog = await screen.findByRole("dialog");

    expect(await within(dialog).findByText("Used by 3 job assignments")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Move to recycle bin" })).not.toBeInTheDocument();
  });
});
