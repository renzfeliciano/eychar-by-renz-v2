"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { FormField, FormError, RequiredFieldsHint } from "@/components/shared/form-field";
import { useFieldErrors } from "@/lib/field-errors";
import { OptionSelect } from "@/components/shared/option-select";

type Option = { id: string; label: string };
type EmploymentTypeOption = Option & { requiresEndOfContract: boolean };

const GENDER_OPTIONS: Option[] = [
  { id: "Male", label: "Male" },
  { id: "Female", label: "Female" },
];

/** API field (POST /api/employees) → the control it's about, for field-level errors. */
const HIRE_FIELD_IDS = {
  firstName: "hire-first-name",
  middleName: "hire-middle-name",
  lastName: "hire-last-name",
  gender: "hire-gender",
  birthDate: "hire-birth-date",
  phone: "hire-phone",
  employeeNumber: "hire-employee-number",
  address: "hire-address",
  employmentType: "hire-employment-type",
  effectiveFrom: "hire-date-hired",
  endOfContract: "hire-end-of-contract",
  positionId: "hire-position",
  projectId: "hire-project",
  sssNumber: "hire-sss",
  philHealthNumber: "hire-philhealth",
  pagIbigNumber: "hire-pagibig",
  tinNumber: "hire-tin",
} as const;

export function HireForm({
  organizationId,
  positions,
  projects,
  employmentTypes,
}: {
  organizationId: string;
  positions: Option[];
  projects: Option[];
  employmentTypes: EmploymentTypeOption[];
}) {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [dateHired, setDateHired] = useState("");
  const [endOfContract, setEndOfContract] = useState("");
  const [sssNumber, setSssNumber] = useState("");
  const [philHealthNumber, setPhilHealthNumber] = useState("");
  const [pagIbigNumber, setPagIbigNumber] = useState("");
  const [tinNumber, setTinNumber] = useState("");
  const [positionId, setPositionId] = useState("");
  const [projectId, setProjectId] = useState("");
  const { fieldErrors, formError, setFieldError, setFromResponse, clear: clearErrors } = useFieldErrors({ fieldIds: HIRE_FIELD_IDS });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedType = employmentTypes.find((type) => type.id === employmentType);
  const showEndOfContract = Boolean(selectedType?.requiresEndOfContract);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearErrors();

    if (!firstName.trim()) return setFieldError("firstName", "First name is required.");
    if (!lastName.trim()) return setFieldError("lastName", "Last name is required.");
    if (!employmentType) return setFieldError("employmentType", "Select an employment type.");
    if (showEndOfContract && !endOfContract) return setFieldError("endOfContract", "End of contract is required for this employment type.");
    setIsSubmitting(true);

    const response = await fetch("/api/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId,
        firstName,
        middleName: middleName || undefined,
        lastName,
        gender: gender || undefined,
        birthDate: birthDate || undefined,
        phone: phone || undefined,
        address: address || undefined,
        employeeNumber: employeeNumber || undefined,
        employmentType,
        effectiveFrom: dateHired || undefined,
        endOfContract: showEndOfContract ? endOfContract : undefined,
        sssNumber: sssNumber || undefined,
        philHealthNumber: philHealthNumber || undefined,
        pagIbigNumber: pagIbigNumber || undefined,
        tinNumber: tinNumber || undefined,
        positionId: positionId || undefined,
        projectId: projectId || undefined,
      }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setFromResponse(body, "Failed to add employee.");
      return;
    }

    toast.success("Employee added");

    router.push("/people");
  }

  return (
    <Card className="max-w-2xl">
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <RequiredFieldsHint />
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="First name" htmlFor="hire-first-name" required error={fieldErrors.firstName}>
              <Input id="hire-first-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder="e.g. Juan Miguel" required />
            </FormField>
            <FormField label="Middle name" htmlFor="hire-middle-name" error={fieldErrors.middleName}>
              <Input id="hire-middle-name" value={middleName} onChange={(event) => setMiddleName(event.target.value)} placeholder="e.g. Santos" />
            </FormField>
            <FormField label="Last name" htmlFor="hire-last-name" required error={fieldErrors.lastName}>
              <Input id="hire-last-name" value={lastName} onChange={(event) => setLastName(event.target.value)} placeholder="e.g. Dela Cruz" required />
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <OptionSelect id="hire-gender" label="Gender" value={gender} onChange={setGender} options={GENDER_OPTIONS} placeholder="Select gender" error={fieldErrors.gender} />
            <FormField label="Birth date" htmlFor="hire-birth-date" error={fieldErrors.birthDate}>
              <Input id="hire-birth-date" type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} />
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Contact number" htmlFor="hire-phone" error={fieldErrors.phone}>
              <Input id="hire-phone" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="09XX-XXX-XXXX" />
            </FormField>
            <FormField label="Employee number" htmlFor="hire-employee-number" error={fieldErrors.employeeNumber}>
              <Input
                id="hire-employee-number"
                value={employeeNumber}
                onChange={(event) => setEmployeeNumber(event.target.value)}
                placeholder="e.g. 0001"
              />
            </FormField>
          </div>
          <FormField label="Address" htmlFor="hire-address" error={fieldErrors.address}>
            <Textarea id="hire-address" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="e.g. 123 Rizal Street, Brgy. San Isidro, Quezon City" />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <OptionSelect
              id="hire-employment-type"
              error={fieldErrors.employmentType}
              label="Employment type"
              value={employmentType}
              onChange={setEmploymentType}
              options={employmentTypes}
              placeholder="Select a type"
              required
            />
            <FormField label="Date hired" htmlFor="hire-date-hired" error={fieldErrors.effectiveFrom}>
              <Input id="hire-date-hired" type="date" value={dateHired} onChange={(event) => setDateHired(event.target.value)} />
            </FormField>
          </div>
          {showEndOfContract && (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="End of contract" htmlFor="hire-end-of-contract" required error={fieldErrors.endOfContract}>
                <Input id="hire-end-of-contract" type="date" value={endOfContract} onChange={(event) => setEndOfContract(event.target.value)} required />
              </FormField>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <OptionSelect
              id="hire-position"
              error={fieldErrors.positionId}
              label="Position"
              value={positionId}
              onChange={setPositionId}
              options={positions}
            />
            <OptionSelect
              id="hire-project"
              error={fieldErrors.projectId}
              label="Project"
              value={projectId}
              onChange={setProjectId}
              options={projects}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="SSS no." htmlFor="hire-sss" error={fieldErrors.sssNumber}>
              <Input id="hire-sss" value={sssNumber} onChange={(event) => setSssNumber(event.target.value)} placeholder="e.g. 34-1234567-8" />
            </FormField>
            <FormField label="PhilHealth no." htmlFor="hire-philhealth" error={fieldErrors.philHealthNumber}>
              <Input id="hire-philhealth" value={philHealthNumber} onChange={(event) => setPhilHealthNumber(event.target.value)} placeholder="e.g. 12-345678901-2" />
            </FormField>
            <FormField label="Pag-IBIG no." htmlFor="hire-pagibig" error={fieldErrors.pagIbigNumber}>
              <Input id="hire-pagibig" value={pagIbigNumber} onChange={(event) => setPagIbigNumber(event.target.value)} placeholder="e.g. 1234-5678-9012" />
            </FormField>
            <FormField label="TIN no." htmlFor="hire-tin" error={fieldErrors.tinNumber}>
              <Input id="hire-tin" value={tinNumber} onChange={(event) => setTinNumber(event.target.value)} placeholder="e.g. 123-456-789" />
            </FormField>
          </div>

          <FormError message={formError} />

          <div className="flex justify-end border-t pt-4">
            <Button type="submit" icon={UserPlus} pending={isSubmitting} pendingLabel="Adding…">
              Add employee
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
