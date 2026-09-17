import { NextResponse } from "next/server";
import { requireSelfServiceEmployee } from "@/server/authorization";
import { WebAuthnService } from "@/domains/identity/webauthn-service";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function POST() {
  try {
    const { userId } = await requireSelfServiceEmployee();
    const options = await WebAuthnService.generateRegistrationOptions(userId);
    return NextResponse.json(options);
  } catch (error) {
    return toErrorResponse(error);
  }
}
