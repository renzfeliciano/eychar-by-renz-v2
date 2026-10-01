// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HolidaysDialog } from "@/app/(app)/attendance/schedules/holidays-dialog";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const entry = (date: string, name: string, alreadyAdded: boolean) => ({ date, name, type: "regular", source: "Proclamation No. 1006, s. 2025", alreadyAdded });

function mockPreview(entries: ReturnType<typeof entry>[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.startsWith("/api/holidays/presets")) {
        return new Response(JSON.stringify({ preview: { year: 2026, country: "Philippines", verified: true, basis: "Proclamation No. 1006, s. 2025.", notes: [], entries } }));
      }
      return new Response(JSON.stringify({ holidays: [] }));
    }),
  );
}

async function openPreview() {
  const user = userEvent.setup();
  render(<HolidaysDialog organizationId="org1" initialYear={2026} />);
  await user.click(screen.getByTestId("schedule-holidays-button"));
  await user.click(await screen.findByTestId("holidays-load-ph"));
  return user;
}

describe("HolidaysDialog preset preview", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("says everything is already saved instead of offering to save 0 holidays", async () => {
    mockPreview([entry("2026-01-01", "New Year's Day", true), entry("2026-12-25", "Christmas Day", true)]);
    const user = await openPreview();

    expect(await screen.findByTestId("holidays-preview-up-to-date")).toHaveTextContent("All 2 holidays for 2026 are already on your calendar");
    expect(screen.queryByTestId("holidays-import-submit")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Select all" })).not.toBeInTheDocument();

    await user.click(screen.getByTestId("holidays-preview-done"));
    await waitFor(() => expect(screen.queryByTestId("holidays-preview")).not.toBeInTheDocument());
  });

  it("counts only the new days and notes the ones already saved", async () => {
    mockPreview([entry("2026-01-01", "New Year's Day", true), entry("2026-12-25", "Christmas Day", false), entry("2026-12-30", "Rizal Day", false)]);
    await openPreview();

    expect(await screen.findByText(/2 of 2 new selected/)).toHaveTextContent("1 already on your calendar");
    expect(screen.getByTestId("holidays-import-submit")).toHaveTextContent("Save 2 holidays");
  });

  it("edits a saved holiday's details", async () => {
    const holiday = { id: "h1", date: "2026-08-21", name: "Ninoy Aquino Day", type: "special_non_working", scope: null, source: "Proclamation No. 1006, s. 2025", presetKey: "PH" };
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") return new Response(JSON.stringify({ holiday }));
      return new Response(JSON.stringify({ holidays: [holiday] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<HolidaysDialog organizationId="org1" initialYear={2026} />);
    await user.click(screen.getByTestId("schedule-holidays-button"));
    await user.click(await screen.findByTestId("holiday-edit-h1"));

    const date = screen.getByLabelText("Date");
    await user.clear(date);
    await user.type(date, "2026-08-23");
    await user.type(screen.getByLabelText("Applies to (optional)"), "Nationwide");
    await user.click(screen.getByTestId("edit-holiday-submit"));

    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true));
    const [url, init] = fetchMock.mock.calls.find(([, call]) => call?.method === "PATCH")!;
    expect(url).toBe("/api/holidays/h1");
    expect(JSON.parse(init!.body as string)).toEqual({
      organizationId: "org1",
      date: "2026-08-23",
      name: "Ninoy Aquino Day",
      type: "special_non_working",
      scope: "Nationwide",
      source: "Proclamation No. 1006, s. 2025",
    });
  });
});
