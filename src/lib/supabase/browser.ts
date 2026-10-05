import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./config";

let browserClient: SupabaseClient | undefined;

export function getSupabaseBrowserClient() {
  if (browserClient) return browserClient;
  const config = getSupabaseConfig();
  if (!config) return null;
  browserClient = createBrowserClient(config.url, config.publishableKey);
  return browserClient;
}
