// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TravelOrderFormDialog } from "@/app/(app)/travel-orders/travel-order-form-dialog";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const EMPLOYEES = [
  { id: "e1", label: "Juan Dela Cruz" },
  { id: "e2", label: "Maria Santos" },
  { id: "e3", label: "Maria Cruz" },
];
const base = { organizationId: "org1", employees: EMPLOYEES };

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  refresh.mockReset();
  fetchMock = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

const sentBody = () => JSON.parse(fetchMock.mock.calls[0][1].body);

async function fillDates(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/^Start date/), "2026-12-01");
  await user.type(screen.getByLabelText(/^End date/), "2026-12-03");
}

describe("TravelOrderFormDialog: employee picker", () => {
  it("is the standard searchable picker: a search box narrows the list of employees", async () => {
    const user = userEvent.setup();
    render(<TravelOrderFormDialog {...base} />);
    await user.click(screen.getByTestId("travel-orders-create-button"));

    expect(screen.getAllByRole("option")).toHaveLength(3);
    fireEvent.change(screen.getByPlaceholderText("Search by name…"), { target: { value: "maria" } });
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["Maria Santos", "Maria Cruz"]);
  });

  it("sends every employee picked, including ones found by searching", async () => {
    const user = userEvent.setup();
    render(<TravelOrderFormDialog {...base} />);
    await user.click(screen.getByTestId("travel-orders-create-button"));

    await user.click(screen.getByText("Juan Dela Cruz"));
    fireEvent.change(screen.getByPlaceholderText("Search by name…"), { target: { value: "santos" } });
    await user.click(screen.getByText("Maria Santos"));
    await fillDates(user);
    await user.click(screen.getByTestId("travel-orders-create-submit-button"));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/travel-orders");
    expect(sentBody()).toMatchObject({ organizationId: "org1", employeeIds: ["e1", "e2"], startDate: "2026-12-01", endDate: "2026-12-03" });
  });

  it("asks for at least one employee before sending", async () => {
    const user = userEvent.setup();
    render(<TravelOrderFormDialog {...base} />);
    await user.click(screen.getByTestId("travel-orders-create-button"));
    await fillDates(user);
    await user.click(screen.getByTestId("travel-orders-create-submit-button"));

    expect(await screen.findByText("Select at least one employee.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("when editing, starts with the order's employees chosen and can change them", async () => {
    const user = userEvent.setup();
    render(<TravelOrderFormDialog {...base} initialValue={{ id: "t1", employeeIds: ["e1", "e3"], startDate: "2026-12-01", endDate: "2026-12-03" }} />);
    await user.click(screen.getByTestId("travel-order-edit-button"));

    expect(screen.getByText("2 selected")).toBeTruthy();
    await user.click(screen.getByText("Maria Cruz"));
    await user.click(screen.getByTestId("travel-order-save-button"));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/travel-orders/t1");
    expect(fetchMock.mock.calls[0][1].method).toBe("PATCH");
    expect(sentBody().employeeIds).toEqual(["e1"]);
  });

  it("shows the server's reason and stays open", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "One employee is already on a trip then" }), { status: 409 }));
    const user = userEvent.setup();
    render(<TravelOrderFormDialog {...base} />);
    await user.click(screen.getByTestId("travel-orders-create-button"));
    await user.click(screen.getByText("Juan Dela Cruz"));
    await fillDates(user);
    await user.click(screen.getByTestId("travel-orders-create-submit-button"));

    expect(await screen.findByText("One employee is already on a trip then")).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });
});
