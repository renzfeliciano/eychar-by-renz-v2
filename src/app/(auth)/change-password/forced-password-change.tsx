"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChangePasswordForm } from "@/components/shared/change-password-form";

export function ForcedPasswordChange({ destination }: { destination: string }) {
  const router = useRouter();
  return (
    <ChangePasswordForm
      submitLabel="Save and continue"
      onChanged={() => {
        toast.success("Password changed. You're all set.");
        router.replace(destination);
        router.refresh();
      }}
    />
  );
}
