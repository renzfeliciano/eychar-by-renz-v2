"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/form-field";

export function DateNav({ date }: { date: string }) {
  const router = useRouter();
  // Controlled, because this component stays mounted across navigations:
  // Base UI's input only reads a defaultValue once, so a changing one both
  // warns and goes stale. The local copy follows the URL (e.g. Back button).
  const [value, setValue] = useState(date);
  const [syncedDate, setSyncedDate] = useState(date);
  if (date !== syncedDate) {
    setSyncedDate(date);
    setValue(date);
  }

  return (
    <FormField label="Date" htmlFor="attendance-date">
      <Input
        id="attendance-date"
        type="date"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          if (event.target.value) router.push(`/attendance?date=${event.target.value}`);
        }}
        className="w-40"
      />
    </FormField>
  );
}
