"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RotateCcw, Save, UserMinus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormError, FormField } from "@/components/shared/form-field";
import { formatMoney } from "@/lib/money";

type Base = { runId: string; organizationId: string; employeeId: string; employeeName: string };

/** PATCH one employee's bonus amount: a peso amount, 0 to leave them out, null for the worked-out amount. */
async function setAmount({ runId, organizationId, employeeId }: Base, amount: number | null): Promise<string | null> {
  const response = await fetch(`/api/payroll-runs/${runId}/bonus`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ organizationId, employeeId, amount }),
  });
  if (response.ok) return null;
  const body = await response.json().catch(() => ({}));
  return typeof body.error === "string" ? body.error : "Couldn't change the bonus amount.";
}

/** On a draft bonus run's payslip: change this person's amount, leave them out, or go back to the worked-out amount. */
export function BonusAmountForm(props: Base & { computed: number; amount: number; overridden: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(String(props.amount));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"save" | "out" | "reset" | null>(null);

  async function send(kind: "save" | "out" | "reset", amount: number | null, message: string) {
    setError(null);
    setPending(kind);
    const failure = await setAmount(props, amount);
    setPending(null);
    if (failure) return setError(failure);
    toast.success(message);
    router.refresh();
  }

  function save() {
    const amount = Number(value);
    if (!value.trim() || !(amount > 0)) return setError("Enter an amount above zero, or use Leave out.");
    void send("save", amount, `${props.employeeName}'s bonus set to ${formatMoney(amount)}`);
  }

  return (
    <section className="flex flex-col gap-2 border-t pt-4">
      <h3 className="text-sm font-medium">Bonus amount</h3>
      <p className="text-xs text-muted-foreground">
        Worked out: {formatMoney(props.computed)}
        {props.overridden ? ` · changed to ${formatMoney(props.amount)}` : ""}
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-40 flex-1">
          <FormField label={`Bonus for ${props.employeeName} (₱)`} htmlFor={`bonus-amount-${props.employeeId}`}>
            <Input id={`bonus-amount-${props.employeeId}`} type="number" min={0} step="0.01" inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} />
          </FormField>
        </div>
        <Button size="sm" onClick={save} icon={Save} pending={pending === "save"} pendingLabel="Saving…">
          Save amount
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => send("out", 0, `${props.employeeName} left out of this bonus`)} icon={UserMinus} pending={pending === "out"} pendingLabel="Leaving out…">
          Leave out
        </Button>
        {props.overridden && (
          <Button size="sm" variant="ghost" onClick={() => send("reset", null, `${props.employeeName}'s bonus back to ${formatMoney(props.computed)}`)} icon={RotateCcw} pending={pending === "reset"} pendingLabel="Resetting…">
            Use {formatMoney(props.computed)}
          </Button>
        )}
      </div>
      <FormError message={error} />
    </section>
  );
}

/** In a draft bonus run's "not in this run" list: puts someone HR left out back at the worked-out amount. */
export function BonusPutBackButton(props: Base) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        size="sm"
        variant="ghost"
        icon={UserPlus}
        pending={pending}
        pendingLabel="Putting back…"
        aria-label={`Put ${props.employeeName} back`}
        onClick={async () => {
          setError(null);
          setPending(true);
          const failure = await setAmount(props, null);
          setPending(false);
          if (failure) return setError(failure);
          toast.success(`${props.employeeName} is back in this bonus`);
          router.refresh();
        }}
      >
        Put back
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
