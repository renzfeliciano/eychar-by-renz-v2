// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EventsCalendar } from "@/app/(app)/events/events-calendar";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
afterEach(cleanup);

const CATEGORIES = [
  { id: "meeting", label: "Meeting" },
  { id: "holiday", label: "Holiday" },
];
const EVENTS = [
  { id: "e1", title: "Town hall", date: "2026-09-29", time: "15:00", category: "meeting", description: null },
  { id: "e2", title: "Safety briefing", date: "2026-09-29", time: "08:00", category: "meeting", description: null },
  { id: "e3", title: "Founding anniversary", date: "2026-09-10", time: null, category: "holiday", description: null, holidayType: "special_non_working" as const },
];

function renderCalendar(canManage = true, canManageHolidays = true) {
  return render(
    <EventsCalendar
      organizationId="org1"
      month="2026-09"
      todayKey="2026-09-28"
      events={EVENTS}
      categories={CATEGORIES}
      categoryNameByCode={new Map(CATEGORIES.map((category) => [category.id, category.label]))}
      holidayCategories={["holiday"]}
      canManageHolidays={canManageHolidays}
      canManage={canManage}
    />,
  );
}

describe("EventsCalendar", () => {
  it("labels each day in words, with its event count, and marks today", () => {
    renderCalendar();
    expect(screen.getByRole("button", { name: "Tuesday, September 29, 2026, 2 events" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Monday, September 28, 2026, today/ })).toHaveAttribute("aria-current", "date");
  });

  it("lists what's coming up from today in order, skipping past events", () => {
    renderCalendar();
    const agenda = screen.getByRole("region", { name: "Coming up" });
    const titles = within(agenda).getAllByRole("listitem").map((item) => item.textContent);
    expect(titles[0]).toContain("Safety briefing");
    expect(titles[1]).toContain("Town hall");
    expect(within(agenda).queryByText("Founding anniversary")).not.toBeInTheDocument();
  });

  it("shows a legend for the categories", () => {
    renderCalendar();
    const legend = screen.getByRole("list", { name: "Categories" });
    expect(within(legend).getByText("Meeting")).toBeInTheDocument();
    expect(within(legend).getByText("Holiday")).toBeInTheDocument();
  });

  it("offers a New event button to people who can manage events", async () => {
    const user = userEvent.setup();
    renderCalendar();
    await user.click(screen.getByRole("button", { name: "New event" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText(/Date/)).toHaveValue("2026-09-28");

    cleanup();
    renderCalendar(false);
    expect(screen.queryByRole("button", { name: "New event" })).not.toBeInTheDocument();
  });

  it("asks for the holiday type only on an event in a holiday category", async () => {
    const user = userEvent.setup();
    renderCalendar();
    await user.click(screen.getByRole("button", { name: /Thursday, September 10, 2026/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Holiday \(Special non-working day\)/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Edit Founding anniversary" }));
    expect(await screen.findByTestId("event-holiday-type")).toHaveTextContent("Special non-working day");

    cleanup();
    renderCalendar();
    await user.click(screen.getByRole("button", { name: /Tuesday, September 29, 2026/ }));
    await user.click(await screen.findByRole("button", { name: "Edit Town hall" }));
    expect(screen.getByLabelText(/Title/)).toHaveValue("Town hall");
    expect(screen.queryByTestId("event-holiday-type")).not.toBeInTheDocument();
  });

  it("doesn't offer to change a holiday event to someone who can't manage the holiday calendar", async () => {
    const user = userEvent.setup();
    renderCalendar(true, false);
    await user.click(screen.getByRole("button", { name: /Thursday, September 10, 2026/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Founding anniversary")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Edit Founding anniversary" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Cancel Founding anniversary" })).not.toBeInTheDocument();

    cleanup();
    renderCalendar(true, false);
    await user.click(screen.getByRole("button", { name: /Tuesday, September 29, 2026/ }));
    expect(await screen.findByRole("button", { name: "Edit Town hall" })).toBeInTheDocument();
  });
});
