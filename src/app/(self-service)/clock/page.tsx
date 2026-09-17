import { getSelfServiceSession } from "@/app/_shared/get-self-service-session";
import { SelfServiceAttendanceService } from "@/domains/attendance/self-service-attendance-service";
import { WebAuthnService } from "@/domains/identity/webauthn-service";
import { ClockPanel } from "./clock-panel";

export default async function ClockPage() {
  const session = await getSelfServiceSession();

  const [today, hasCredential] = await Promise.all([
    SelfServiceAttendanceService.getTodayRecord(session.employeeId, session.organizationId),
    WebAuthnService.hasRegisteredCredential(session.userId),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Hi, {session.name.split(" ")[0]}</h1>
        <p className="text-sm text-muted-foreground">Employee #{session.employeeNumber}</p>
      </div>
      <ClockPanel
        today={
          today
            ? {
                checkInAt: today.checkInAt ? today.checkInAt.toISOString() : null,
                checkOutAt: today.checkOutAt ? today.checkOutAt.toISOString() : null,
                status: today.status,
              }
            : null
        }
        hasCredential={hasCredential}
      />
    </div>
  );
}
