import { NextRequest, NextResponse } from "next/server";
import { requireSelfServiceEmployee } from "@/server/authorization";
import { WebAuthnService } from "@/domains/identity/webauthn-service";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function POST(request: NextRequest) {
  try {
    const { userId, organizationId } = await requireSelfServiceEmployee();
    const response = await request.json();
    await WebAuthnService.verifyRegistration(userId, organizationId, response);
    return NextResponse.json({ verified: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
