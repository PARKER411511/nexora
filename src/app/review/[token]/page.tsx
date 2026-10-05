import { notFound } from "next/navigation";
import { ReviewClient } from "@/components/ReviewClient";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { cloudGetReview, isCloudSetupError } from "@/lib/supabase/repository";
import { CloudUnavailable } from "@/components/CloudUnavailable";
import { AuthenticationRequiredError } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!hasSupabaseConfig()) return <CloudUnavailable />;
  let review;
  try {
    review = await cloudGetReview(token);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError)
      redirect(`/auth/sign-in?next=${encodeURIComponent(`/review/${token}`)}`);
    if (isCloudSetupError(error)) return <CloudUnavailable />;
    throw error;
  }
  if (!review) notFound();
  return <ReviewClient initial={review} />;
}
