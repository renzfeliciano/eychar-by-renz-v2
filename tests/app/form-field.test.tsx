// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormField } from "@/components/shared/form-field";
import { OptionSelect } from "@/components/shared/option-select";
import { Input } from "@/components/ui/input";
import { splitApiError } from "@/lib/field-errors";
import { HireForm } from "@/app/(app)/people/new/hire-form";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("FormField field-level errors", () => {
  it("shows the error under the control and wires aria-invalid + aria-describedby onto it", () => {
    render(
      <FormField label="Username" htmlFor="username" description="Letters, numbers and dots." error="Username is already taken">
        <Input id="username" aria-describedby="existing-hint" />
      </FormField>,
    );
    const input = screen.getByLabelText("Username");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")?.split(" ")).toEqual(["existing-hint", "username-description", "username-error"]);
    expect(document.getElementById("username-error")).toHaveTextContent("Username is already taken");
    expect(input).toHaveAccessibleDescription(/Username is already taken/);
  });

  it("leaves the control alone when there's nothing to describe", () => {
    render(
      <FormField label="Username" htmlFor="username">
        <Input id="username" />
      </FormField>,
    );
    const input = screen.getByLabelText("Username");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).not.toHaveAttribute("aria-describedby");
  });

  it("reaches a Select's trigger through the Select root, and OptionSelect's label now names its trigger", () => {
    render(<OptionSelect id="role" label="Role" value="" onChange={() => {}} options={[{ id: "r1", label: "HR" }]} error="Pick a role" />);
    const trigger = screen.getByRole("combobox", { name: "Role" });
    expect(trigger).toHaveAttribute("aria-invalid", "true");
    expect(trigger).toHaveAttribute("aria-describedby", "role-error");
  });
});

describe("splitApiError", () => {
  it("routes a validation error to the field the form renders, anything else to the form", () => {
    expect(splitApiError({ error: "Code is required", field: "code" }, "Failed", ["name", "code"])).toMatchObject({ field: "code", fieldErrors: { code: "Code is required" }, formError: null });
    expect(splitApiError({ error: "Rate must be a number", field: "rate" }, "Failed", ["name"])).toMatchObject({ field: null, fieldErrors: {}, formError: "Rate must be a number" });
    expect(splitApiError({}, "Couldn't save.")).toMatchObject({ formError: "Couldn't save." });
    expect(splitApiError(null, "Couldn't save.")).toMatchObject({ formError: "Couldn't save." });
  });
});

describe("HireForm field errors", () => {
  const props = { organizationId: "org1", employmentTypes: [{ id: "regular", label: "Regular", requiresEndOfContract: false }], positions: [], projects: [], managers: [] };

  it("marks the missing required field itself rather than only showing a form-level card", async () => {
    render(<HireForm {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "Add employee" }));
    const firstName = screen.getByLabelText(/First name/);
    expect(firstName).toHaveAttribute("aria-invalid", "true");
    expect(firstName).toHaveAccessibleDescription("First name is required.");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("puts a server validation error with a `field` under that field", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Employee number is already in use", field: "employeeNumber" }), { status: 409 })));
    render(<HireForm {...props} />);
    await userEvent.type(screen.getByLabelText(/First name/), "Ana");
    await userEvent.type(screen.getByLabelText(/Last name/), "Reyes");
    await userEvent.click(screen.getByRole("combobox", { name: /Employment type/ }));
    await userEvent.click(await screen.findByRole("option", { name: "Regular" }));
    await userEvent.click(screen.getByRole("button", { name: "Add employee" }));

    const employeeNumber = await screen.findByLabelText("Employee number");
    await vi.waitFor(() => expect(employeeNumber).toHaveAttribute("aria-invalid", "true"));
    expect(employeeNumber).toHaveAccessibleDescription("Employee number is already in use");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
