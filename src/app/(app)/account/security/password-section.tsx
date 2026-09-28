"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChangePasswordForm } from "@/components/shared/change-password-form";

export function PasswordSection() {
  const router = useRouter();
  return (
    <ChangePasswordForm
      onChanged={() => {
        toast.success("Password changed");
        router.refresh();
      }}
    />
  );
}
