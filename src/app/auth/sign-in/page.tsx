import { AuthForm } from "@/components/AuthForm";
import { CloudUnavailable } from "@/components/CloudUnavailable";
import { hasSupabaseConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const query = await searchParams;
  const initialError =
    query.error === "confirmation_failed"
      ? "Email confirmation could not be completed. Request a new link and try again."
      : query.error === "missing_code"
        ? "The confirmation link is incomplete."
        : undefined;
  return hasSupabaseConfig() ? (
    <AuthForm mode="signin" next={query.next} initialError={initialError} />
  ) : (
    <CloudUnavailable compact />
  );
}
