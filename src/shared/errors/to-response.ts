import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "./app-error";

/**
 * Route handlers convert any thrown error to an HTTP response through this
 * single chokepoint, so an unexpected/database error never leaks internal
 * messages or stack details to the client (per AGENTS.md §48).
 */
export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json(
      { error: error.message, details: error.details },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Invalid input", details: error.flatten() },
      { status: 400 },
    );
  }
  console.error(error);
  return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
}
