"use client";

import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/form-field";

export function DateNav({ date }: { date: string }) {
  const router = useRouter();

  return (
    <FormField label="Date" htmlFor="attendance-date">
      <Input
        id="attendance-date"
        type="date"
        defaultValue={date}
        onChange={(event) => router.push(`/attendance?date=${event.target.value}`)}
        className="w-40"
      />
    </FormField>
  );
}
