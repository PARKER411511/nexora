import { AuthForm } from "@/components/AuthForm";
import { CloudUnavailable } from "@/components/CloudUnavailable";
import { hasSupabaseConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const query = await searchParams;
  return hasSupabaseConfig() ? (
    <AuthForm mode="signup" next={query.next} />
  ) : (
    <CloudUnavailable compact />
  );
}
