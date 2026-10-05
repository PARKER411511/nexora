import { NextResponse } from "next/server";
import {
  AuthenticationRequiredError,
  SupabaseUnavailableError,
} from "./server";
import { CloudDomainError } from "./repository";

export function cloudErrorResponse(
  error: unknown,
  fallback = "Cloud operation failed",
) {
  const raw = error instanceof Error ? error.message : "";
  const setup = /PGRST20[25]|schema cache|relation .* does not exist/i.test(
    raw,
  );
  const status =
    setup || error instanceof SupabaseUnavailableError
      ? 503
      : error instanceof AuthenticationRequiredError
        ? 401
        : error instanceof CloudDomainError
          ? error.status
          : 400;
  return NextResponse.json(
    {
      error: setup
        ? "Cloud workspace setup is not complete yet. Apply the Supabase migration and try again."
        : raw || fallback,
    },
    { status },
  );
}
