import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { requireAuthenticatedUser } from "@/server/authorization";
import { MfaService } from "@/domains/identity/mfa-service";
import { mfaActionSchema } from "@/shared/validation/account";
import { toErrorResponse } from "@/shared/errors/to-response";

/**
 * The signed-in person's two-factor sign-in: start setup (returns the QR
 * code and the key to type in by hand), confirm it with a code (returns the
 * recovery codes, once), turn it off, or get new recovery codes.
 */
export async function POST(request: Request) {
  try {
    const { userId } = await requireAuthenticatedUser({ allowPendingTwoStepSetup: true });
    const input = mfaActionSchema.parse(await request.json());

    switch (input.action) {
      case "start": {
        await MfaService.confirmPassword(userId, input.password);
        const { secret, otpauthUri } = await MfaService.startEnrollment(userId);
        const qrCode = await QRCode.toDataURL(otpauthUri, { errorCorrectionLevel: "M", margin: 1, width: 220 });
        return NextResponse.json({ secret, qrCode });
      }
      case "confirm":
        return NextResponse.json(await MfaService.confirmEnrollment(userId, input.code));
      case "disable":
        await MfaService.disable(userId, input.password);
        return NextResponse.json({ ok: true });
      case "regenerate-recovery-codes":
        return NextResponse.json(await MfaService.regenerateRecoveryCodes(userId, input.password));
    }
  } catch (error) {
    return toErrorResponse(error);
  }
}
