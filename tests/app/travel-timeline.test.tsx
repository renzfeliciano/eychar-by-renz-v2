// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { TravelTimeline } from "@/app/(app)/travel-orders/travel-timeline";

afterEach(cleanup);

const d = (key: string) => new Date(`${key}T00:00:00.000Z`);

describe("TravelTimeline", () => {
  it("draws each trip in the next two weeks as a labelled bar, with today marked", () => {
    render(
      <TravelTimeline
        todayKey="2026-09-28"
        orders={[
          { id: "o1", names: ["Maria Santos", "Ana Reyes"], startDate: d("2026-09-25"), endDate: d("2026-09-29"), status: "scheduled", remarks: "Site audit, Cebu" },
          { id: "o2", names: ["Jose Mercado"], startDate: d("2026-10-20"), endDate: d("2026-10-22"), status: "scheduled", remarks: null },
        ]}
      />,
    );

    expect(screen.getByRole("img", { name: "Maria Santos, Ana Reyes: Sep 25 – Sep 29, Site audit, Cebu" })).toBeInTheDocument();
    // Outside the window: not drawn.
    expect(screen.queryByText("Jose Mercado")).not.toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
  });

  it("says so when nobody is travelling in the window", () => {
    render(<TravelTimeline todayKey="2026-09-28" orders={[]} />);
    expect(screen.getByText("No one is scheduled to travel in the next two weeks.")).toBeInTheDocument();
  });
});
