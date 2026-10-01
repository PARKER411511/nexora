import { notFound } from "next/navigation";
import { isDemoMode } from "@/lib/mode";
import { DemoReviewPage } from "@/components/DemoReviewPage";
import { ReviewClient } from "@/components/ReviewClient";

export const dynamic = "force-dynamic";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (isDemoMode()) return <DemoReviewPage token={token} />;
  const { getReview } = await import("@/lib/db");
  const review = getReview(token);
  if (!review) notFound();
  return <ReviewClient initial={review} />;
}
