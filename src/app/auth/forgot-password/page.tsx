import { AuthForm } from "@/components/AuthForm";
import { CloudUnavailable } from "@/components/CloudUnavailable";
import { hasSupabaseConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";
export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; error?: string }>;
}) {
  const query = await searchParams;
  const initialError =
    query.error === "reset_session_missing"
      ? "That password reset link is missing or expired. Request a fresh link below."
      : undefined;
  return hasSupabaseConfig() ? (
    <AuthForm mode="forgot" initialEmail={query.email} initialError={initialError} />
  ) : (
    <CloudUnavailable compact />
  );
}
