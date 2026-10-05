import { AuthForm } from "@/components/AuthForm";
import { CloudUnavailable } from "@/components/CloudUnavailable";
import { hasSupabaseConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";
export default async function ResetPasswordPage() {
  return hasSupabaseConfig() ? (
    <AuthForm mode="reset" />
  ) : (
    <CloudUnavailable compact />
  );
}
