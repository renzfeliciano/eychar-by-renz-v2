"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { FormField, FormError, RequiredFieldsHint } from "@/components/shared/form-field";
import { OptionSelect } from "@/components/shared/option-select";

type Option = { id: string; label: string };
type EmploymentTypeOption = Option & { requiresEndOfContract: boolean };

const GENDER_OPTIONS: Option[] = [
  { id: "Male", label: "Male" },
  { id: "Female", label: "Female" },
];

export function HireForm({
  organizationId,
  positions,
  projects,
  managers,
  employmentTypes,
}: {
  organizationId: string;
  positions: Option[];
  projects: Option[];
  managers: Option[];
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
  const [reportsToEmployeeId, setReportsToEmployeeId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedType = employmentTypes.find((type) => type.id === employmentType);
  const showEndOfContract = Boolean(selectedType?.requiresEndOfContract);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!firstName.trim()) {
      setError("First name is required.");
      return;
    }
    if (!lastName.trim()) {
      setError("Last name is required.");
      return;
    }
    if (!employeeNumber.trim()) {
      setError("Employee number is required.");
      return;
    }
    if (!employmentType) {
      setError("Select an employment type.");
      return;
    }
    if (showEndOfContract && !endOfContract) {
      setError("End of contract is required for this employment type.");
      return;
    }
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
        employeeNumber,
        employmentType,
        effectiveFrom: dateHired || undefined,
        endOfContract: showEndOfContract ? endOfContract : undefined,
        sssNumber: sssNumber || undefined,
        philHealthNumber: philHealthNumber || undefined,
        pagIbigNumber: pagIbigNumber || undefined,
        tinNumber: tinNumber || undefined,
        positionId: positionId || undefined,
        projectId: projectId || undefined,
        reportsToEmployeeId: reportsToEmployeeId || undefined,
      }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to add employee.");
      return;
    }

    router.push("/people");
  }

  return (
    <Card className="max-w-2xl">
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <RequiredFieldsHint />
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="First name" htmlFor="hire-first-name" required>
              <Input id="hire-first-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder="e.g. Juan Miguel" required />
            </FormField>
            <FormField label="Middle name" htmlFor="hire-middle-name">
              <Input id="hire-middle-name" value={middleName} onChange={(event) => setMiddleName(event.target.value)} placeholder="e.g. Santos" />
            </FormField>
            <FormField label="Last name" htmlFor="hire-last-name" required>
              <Input id="hire-last-name" value={lastName} onChange={(event) => setLastName(event.target.value)} placeholder="e.g. Dela Cruz" required />
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <OptionSelect label="Gender" value={gender} onChange={setGender} options={GENDER_OPTIONS} placeholder="Select gender" />
            <FormField label="Birth date" htmlFor="hire-birth-date">
              <Input id="hire-birth-date" type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} />
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Contact number" htmlFor="hire-phone">
              <Input id="hire-phone" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="09XX-XXX-XXXX" />
            </FormField>
            <FormField label="Employee number" htmlFor="hire-employee-number" required>
              <Input
                id="hire-employee-number"
                value={employeeNumber}
                onChange={(event) => setEmployeeNumber(event.target.value)}
                placeholder="e.g. 0001"
                required
              />
            </FormField>
          </div>
          <FormField label="Address" htmlFor="hire-address">
            <Textarea id="hire-address" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="e.g. 123 Rizal Street, Brgy. San Isidro, Quezon City" />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <OptionSelect
              label="Employment type"
              value={employmentType}
              onChange={setEmploymentType}
              options={employmentTypes}
              placeholder="Select a type"
              required
            />
            <FormField label="Date hired" htmlFor="hire-date-hired">
              <Input id="hire-date-hired" type="date" value={dateHired} onChange={(event) => setDateHired(event.target.value)} />
            </FormField>
          </div>
          {showEndOfContract && (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="End of contract" htmlFor="hire-end-of-contract" required>
                <Input id="hire-end-of-contract" type="date" value={endOfContract} onChange={(event) => setEndOfContract(event.target.value)} required />
              </FormField>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <OptionSelect
              label="Position"
              value={positionId}
              onChange={setPositionId}
              options={positions}
            />
            <OptionSelect
              label="Project"
              value={projectId}
              onChange={setProjectId}
              options={projects}
            />
          </div>
          <OptionSelect
            label="Reports to"
            value={reportsToEmployeeId}
            onChange={setReportsToEmployeeId}
            options={managers}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="SSS no." htmlFor="hire-sss">
              <Input id="hire-sss" value={sssNumber} onChange={(event) => setSssNumber(event.target.value)} placeholder="e.g. 34-1234567-8" />
            </FormField>
            <FormField label="PhilHealth no." htmlFor="hire-philhealth">
              <Input id="hire-philhealth" value={philHealthNumber} onChange={(event) => setPhilHealthNumber(event.target.value)} placeholder="e.g. 12-345678901-2" />
            </FormField>
            <FormField label="Pag-IBIG no." htmlFor="hire-pagibig">
              <Input id="hire-pagibig" value={pagIbigNumber} onChange={(event) => setPagIbigNumber(event.target.value)} placeholder="e.g. 1234-5678-9012" />
            </FormField>
            <FormField label="TIN no." htmlFor="hire-tin">
              <Input id="hire-tin" value={tinNumber} onChange={(event) => setTinNumber(event.target.value)} placeholder="e.g. 123-456-789" />
            </FormField>
          </div>

          <FormError message={error} />

          <Button type="submit" disabled={isSubmitting} className="self-start">
            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
            {isSubmitting ? "Adding…" : "Add employee"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
