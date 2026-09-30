// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettlementActions } from "@/app/(app)/final-settlements/[id]/settlement-actions";
import { ManualLineForm } from "@/app/(app)/final-settlements/[id]/manual-line-form";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const ALL = { canPrepare: true, canReview: true, canApprove: true, canDisburse: true };
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  refresh.mockReset();
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ settlement: {} }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

describe("SettlementActions", () => {
  it("offers only the next step for the settlement's status", () => {
    const { rerender } = render(<SettlementActions organizationId="org1" settlementId="s1" clearanceCaseId="c1" status="draft" clearanceCleared permissions={ALL} paymentMethods={[]} />);
    expect(screen.getByRole("button", { name: "Submit for review" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();

    rerender(<SettlementActions organizationId="org1" settlementId="s1" clearanceCaseId="c1" status="reviewed" clearanceCleared permissions={ALL} paymentMethods={[]} />);
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit for review" })).not.toBeInTheDocument();
  });

  it("explains why a draft can't be submitted while clearance is open", () => {
    render(<SettlementActions organizationId="org1" settlementId="s1" clearanceCaseId="c1" status="draft" clearanceCleared={false} permissions={ALL} paymentMethods={[]} />);
    expect(screen.getByRole("button", { name: "Submit for review" })).toBeDisabled();
    expect(screen.getByText(/Clearance still has blocking items/)).toBeInTheDocument();
  });

  it("records the payment method and reference when disbursing", async () => {
    const user = userEvent.setup();
    render(
      <SettlementActions
        organizationId="org1"
        settlementId="s1"
        clearanceCaseId="c1"
        status="approved"
        clearanceCleared
        permissions={ALL}
        paymentMethods={[{ id: "bank_transfer", label: "Bank transfer" }]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Record payment" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByTestId("settlement-payment-method-select"));
    await user.click(await screen.findByRole("option", { name: "Bank transfer" }));
    await user.type(within(dialog).getByLabelText(/Payment reference/), "BDO-0042");
    await user.click(within(dialog).getByRole("button", { name: "Mark as paid" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ organizationId: "org1", action: "disburse", paymentMethodCode: "bank_transfer", paymentReference: "BDO-0042" });
  });

  it("asks what to correct when returning", async () => {
    const user = userEvent.setup();
    render(<SettlementActions organizationId="org1" settlementId="s1" clearanceCaseId="c1" status="submitted" clearanceCleared permissions={ALL} paymentMethods={[]} />);

    await user.click(screen.getByRole("button", { name: "Return" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/What needs correcting/), "Bonus missing");
    await user.click(within(dialog).getByRole("button", { name: "Return to draft" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ organizationId: "org1", action: "return", note: "Bonus missing" });
  });
});

describe("ManualLineForm", () => {
  it("adds an earning with its reason", async () => {
    const user = userEvent.setup();
    render(<ManualLineForm organizationId="org1" settlementId="s1" />);

    await user.click(screen.getByRole("button", { name: /Add a line/ }));
    await user.type(screen.getByLabelText(/^Description/), "Performance bonus");
    await user.type(screen.getByLabelText(/^Amount/), "5000");
    await user.type(screen.getByLabelText(/Reason or basis/), "Q3 bonus approved 2026-09-30");
    await user.click(screen.getByRole("button", { name: "Add line" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/final-settlements/s1/lines");
    expect(JSON.parse(init.body)).toEqual({ organizationId: "org1", direction: "earning", label: "Performance bonus", amount: 5000, reason: "Q3 bonus approved 2026-09-30" });
  });
});
