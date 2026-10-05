import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./config";

export class SupabaseUnavailableError extends Error {
  status = 503;
}

export class AuthenticationRequiredError extends Error {
  status = 401;
}

export async function createSupabaseServerClient() {
  const config = getSupabaseConfig();
  if (!config)
    throw new SupabaseUnavailableError("Cloud storage is not configured yet.");
  const cookieStore = await cookies();
  return createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components cannot always mutate cookies; proxy.ts handles refresh writes.
        }
      },
    },
  });
}

export async function getServerUser(): Promise<User | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

export async function requireServerUser() {
  const user = await getServerUser();
  if (!user)
    throw new AuthenticationRequiredError("Sign in to use this workspace.");
  return user;
}

export function isSupabaseError(error: unknown): error is { status: number } {
  return (
    error instanceof SupabaseUnavailableError ||
    error instanceof AuthenticationRequiredError
  );
}

export type ServerSupabaseClient = SupabaseClient;
