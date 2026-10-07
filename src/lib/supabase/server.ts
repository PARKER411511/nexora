import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
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

/** Server-only provider administration client. Never call this from a client component. */
export function getSupabaseAdminClient(): SupabaseClient | null {
  const config = getSupabaseConfig();
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!config || !secret) return null;
  return createClient(config.url, secret, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
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
