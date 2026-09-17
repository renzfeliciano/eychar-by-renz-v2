import { NextResponse } from "next/server";
import { requireSelfServiceEmployee } from "@/server/authorization";
import { WebAuthnService } from "@/domains/identity/webauthn-service";
import { toErrorResponse } from "@/shared/errors/to-response";

/** A fresh authentication challenge for the clock-in/out biometric confirmation — not registration. */
export async function POST() {
  try {
    const { userId } = await requireSelfServiceEmployee();
    const options = await WebAuthnService.generateAuthenticationOptions(userId);
    return NextResponse.json(options);
  } catch (error) {
    return toErrorResponse(error);
  }
}
