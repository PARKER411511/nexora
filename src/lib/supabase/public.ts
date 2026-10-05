import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./config";

export function createSupabasePublicClient() {
  const config = getSupabaseConfig();
  if (!config) return null;
  return createClient(config.url, config.publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
