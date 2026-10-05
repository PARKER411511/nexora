import { AuthForm } from "@/components/AuthForm";
import { CloudUnavailable } from "@/components/CloudUnavailable";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { getServerUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export default async function ResetPasswordPage() {
  const user = hasSupabaseConfig() ? await getServerUser() : null;
  return hasSupabaseConfig() ? (
    user ? (
      <AuthForm mode="reset" />
    ) : (
      <AuthForm
        mode="forgot"
        initialError="That password reset link is missing or expired. Request a fresh link below."
      />
    )
  ) : (
    <CloudUnavailable compact />
  );
}
