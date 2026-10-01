import { notFound } from "next/navigation";
import { getReview } from "@/lib/db";
import { ReviewClient } from "@/components/ReviewClient";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) { const { token } = await params; const review = getReview(token); if (!review) notFound(); return <ReviewClient initial={review} />; }
