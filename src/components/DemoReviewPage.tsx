"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { demoGetReview, DemoStorageError } from "@/lib/demo-store";
import type { ReviewSnapshot } from "@/lib/types";
import { ReviewClient } from "./ReviewClient";

export function DemoReviewPage({ token }: { token: string }) {
  const [review, setReview] = useState<ReviewSnapshot | null | undefined>(
    undefined,
  );
  const [error, setError] = useState("");
  useEffect(() => {
    try {
      setReview(demoGetReview(token));
    } catch (reason) {
      setError(
        reason instanceof DemoStorageError
          ? reason.message
          : "Demo review data could not be loaded.",
      );
      setReview(null);
    }
  }, [token]);
  if (error)
    return (
      <main className="review-page">
        <div className="empty-state">
          <div className="section-kicker">Demo review unavailable</div>
          <h1>Open this review in the same browser.</h1>
          <p>{error}</p>
          <Link className="button-secondary" href="/workspace">
            Back to workspace
          </Link>
        </div>
      </main>
    );
  if (review === undefined)
    return (
      <main className="review-page">
        <div className="empty-state">
          <div className="section-kicker">Loading browser review</div>
          <p>Reading this browser’s saved review snapshot…</p>
        </div>
      </main>
    );
  if (!review)
    return (
      <main className="review-page">
        <div className="empty-state">
          <div className="section-kicker">
            This demo link is local to one browser
          </div>
          <h1>Review data is not available here.</h1>
          <p>
            Demo share links are intentionally scoped to the browser that
            created them. Return to the Nexora workspace on the original device
            to continue.
          </p>
          <Link className="button-secondary" href="/workspace">
            Back to workspace
          </Link>
        </div>
      </main>
    );
  return <ReviewClient demoMode initial={review} />;
}
