"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Loader2, Pencil } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormField, FormError, RequiredFieldsHint } from "@/components/shared/form-field";
import { OptionSelect, type SelectOption } from "@/components/shared/option-select";
import { focusInvalidField } from "@/lib/focus-invalid-field";
import { cn } from "@/lib/utils";

const GENDER_OPTIONS: SelectOption[] = [
  { id: "Male", label: "Male" },
  { id: "Female", label: "Female" },
];

export type EditEmployeeInitialValue = {
  firstName: string;
  middleName?: string | null;
  lastName: string;
  email?: string | null;
  employeeNumber?: string | null;
  gender?: string | null;
  birthDate?: string | null;
  phone?: string | null;
  address?: string | null;
  sssNumber?: string | null;
  philHealthNumber?: string | null;
  pagIbigNumber?: string | null;
  tinNumber?: string | null;
};

export function EditEmployeeDialog({
  organizationId,
  employeeId,
  initialValue,
}: {
  organizationId: string;
  employeeId: string;
  initialValue: EditEmployeeInitialValue;
}) {
  const router = useRouter();
  const formId = `edit-employee-form-${employeeId}`;

  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState(initialValue.firstName);
  const [middleName, setMiddleName] = useState(initialValue.middleName ?? "");
  const [lastName, setLastName] = useState(initialValue.lastName);
  const [email, setEmail] = useState(initialValue.email ?? "");
  const [employeeNumber, setEmployeeNumber] = useState(initialValue.employeeNumber ?? "");
  const [gender, setGender] = useState(initialValue.gender ?? "");
  const [birthDate, setBirthDate] = useState(initialValue.birthDate ?? "");
  const [phone, setPhone] = useState(initialValue.phone ?? "");
  const [address, setAddress] = useState(initialValue.address ?? "");
  const [sssNumber, setSssNumber] = useState(initialValue.sssNumber ?? "");
  const [philHealthNumber, setPhilHealthNumber] = useState(initialValue.philHealthNumber ?? "");
  const [pagIbigNumber, setPagIbigNumber] = useState(initialValue.pagIbigNumber ?? "");
  const [tinNumber, setTinNumber] = useState(initialValue.tinNumber ?? "");
  const [error, setError] = useState<string | null>(null);
  const [invalidField, setInvalidField] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function resetToInitial() {
    setFirstName(initialValue.firstName);
    setMiddleName(initialValue.middleName ?? "");
    setLastName(initialValue.lastName);
    setEmail(initialValue.email ?? "");
    setEmployeeNumber(initialValue.employeeNumber ?? "");
    setGender(initialValue.gender ?? "");
    setBirthDate(initialValue.birthDate ?? "");
    setPhone(initialValue.phone ?? "");
    setAddress(initialValue.address ?? "");
    setSssNumber(initialValue.sssNumber ?? "");
    setPhilHealthNumber(initialValue.philHealthNumber ?? "");
    setPagIbigNumber(initialValue.pagIbigNumber ?? "");
    setTinNumber(initialValue.tinNumber ?? "");
    setError(null);
    setInvalidField(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) resetToInitial();
    setOpen(nextOpen);
  }

  function clearFieldError(field: string) {
    if (invalidField === field) setInvalidField(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch(`/api/employees/${employeeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      // Every optional field here is sent as-is, blank or not — this is an
      // edit form pre-filled with the employee's current values, so a field
      // the user cleared on purpose needs to reach the API as "" (meaning
      // "clear it"), not silently vanish into `undefined` ("don't touch it").
      body: JSON.stringify({
        organizationId,
        firstName,
        middleName,
        lastName,
        email,
        employeeNumber,
        gender,
        birthDate,
        phone,
        address,
        sssNumber,
        philHealthNumber,
        pagIbigNumber,
        tinNumber,
      }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to update employee.");
      setInvalidField(body.field ?? null);
      focusInvalidField(formId, body.field);
      return;
    }

    setOpen(false);
    toast.success("Employee details saved");
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }))} data-testid="edit-employee-button">
        <Pencil className="size-3.5" />
        Edit details
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit employee details</DialogTitle>
          <DialogDescription>Updates this employee&apos;s personal and statutory information.</DialogDescription>
        </DialogHeader>
        <form id={formId} onSubmit={handleSubmit} noValidate className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
          <RequiredFieldsHint />
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="First name" htmlFor={`${formId}-firstName`} required>
              <Input
                id={`${formId}-firstName`}
                value={firstName}
                onChange={(event) => {
                  setFirstName(event.target.value);
                  clearFieldError("firstName");
                }}
                aria-invalid={invalidField === "firstName"}
                required
              />
            </FormField>
            <FormField label="Middle name" htmlFor={`${formId}-middleName`}>
              <Input id={`${formId}-middleName`} value={middleName} onChange={(event) => setMiddleName(event.target.value)} />
            </FormField>
            <FormField label="Last name" htmlFor={`${formId}-lastName`} required>
              <Input
                id={`${formId}-lastName`}
                value={lastName}
                onChange={(event) => {
                  setLastName(event.target.value);
                  clearFieldError("lastName");
                }}
                aria-invalid={invalidField === "lastName"}
                required
              />
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <OptionSelect label="Gender" value={gender} onChange={setGender} options={GENDER_OPTIONS} placeholder="Select gender" />
            <FormField label="Birth date" htmlFor={`${formId}-birthDate`}>
              <Input id={`${formId}-birthDate`} type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} />
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Email" htmlFor={`${formId}-email`}>
              <Input
                id={`${formId}-email`}
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  clearFieldError("email");
                }}
                placeholder="e.g. juan.delacruz@company.com"
                aria-invalid={invalidField === "email"}
              />
            </FormField>
            <FormField label="Contact number" htmlFor={`${formId}-phone`}>
              <Input id={`${formId}-phone`} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="09XX-XXX-XXXX" />
            </FormField>
          </div>
          <FormField label="Employee number" htmlFor={`${formId}-employeeNumber`}>
            <Input
              id={`${formId}-employeeNumber`}
              value={employeeNumber}
              onChange={(event) => {
                setEmployeeNumber(event.target.value);
                clearFieldError("employeeNumber");
              }}
              placeholder="e.g. 0001"
              aria-invalid={invalidField === "employeeNumber"}
            />
          </FormField>
          <FormField label="Address" htmlFor={`${formId}-address`}>
            <Textarea
              id={`${formId}-address`}
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="e.g. 123 Rizal Street, Brgy. San Isidro, Quezon City"
            />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="SSS no." htmlFor={`${formId}-sssNumber`}>
              <Input id={`${formId}-sssNumber`} value={sssNumber} onChange={(event) => setSssNumber(event.target.value)} placeholder="e.g. 34-1234567-8" />
            </FormField>
            <FormField label="PhilHealth no." htmlFor={`${formId}-philHealthNumber`}>
              <Input
                id={`${formId}-philHealthNumber`}
                value={philHealthNumber}
                onChange={(event) => setPhilHealthNumber(event.target.value)}
                placeholder="e.g. 12-345678901-2"
              />
            </FormField>
            <FormField label="Pag-IBIG no." htmlFor={`${formId}-pagIbigNumber`}>
              <Input
                id={`${formId}-pagIbigNumber`}
                value={pagIbigNumber}
                onChange={(event) => setPagIbigNumber(event.target.value)}
                placeholder="e.g. 1234-5678-9012"
              />
            </FormField>
            <FormField label="TIN no." htmlFor={`${formId}-tinNumber`}>
              <Input id={`${formId}-tinNumber`} value={tinNumber} onChange={(event) => setTinNumber(event.target.value)} placeholder="e.g. 123-456-789" />
            </FormField>
          </div>
          <FormError message={error} />
        </form>
        <DialogFooter>
          <Button type="submit" form={formId} disabled={isSubmitting} data-testid="edit-employee-submit-button">
            {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {isSubmitting ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
