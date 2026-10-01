"use client";

import { Check, LoaderCircle, Printer, Send } from "lucide-react";
import { useState } from "react";
import type { ReviewSnapshot } from "@/lib/types";

export function ReviewClient({ initial }: { initial: ReviewSnapshot }) {
  const [review, setReview] = useState(initial);
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [requestTitle, setRequestTitle] = useState("");
  const [requestDetails, setRequestDetails] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const locked = review.status === "approved";
  const requests = review.changeRequests ?? [];

  async function post(body: Record<string, unknown>, successMessage: string) {
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const response = await fetch(`/api/review/${review.reviewToken}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setReview(data.review);
      setMessage(successMessage);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save response");
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function respond(action: "feedback" | "approval") {
    if (!name.trim() || !comment.trim()) {
      setError("Add your name and a comment up to 4,000 characters.");
      return;
    }
    const saved = await post(
      { name, comment, action },
      action === "approval"
        ? "Scope approved. This snapshot is now locked."
        : "Feedback saved for the project owner.",
    );
    if (saved) setComment("");
  }

  async function requestChange() {
    const saved = await post(
      {
        action: "change_request",
        name,
        title: requestTitle,
        details: requestDetails,
      },
      "Change request sent to the project owner.",
    );
    if (saved) {
      setRequestTitle("");
      setRequestDetails("");
    }
  }

  async function decideProposal(
    proposalId: string,
    decision: "accepted" | "declined",
  ) {
    if (!name.trim()) {
      setError("Add your name before deciding on a proposal.");
      return;
    }
    const saved = await post(
      { action: "proposal_decision", name, proposalId, decision, comment },
      decision === "accepted"
        ? "Proposal accepted and recorded."
        : "Proposal declined and recorded.",
    );
    if (saved) setComment("");
  }

  return (
    <main className="review-page">
      <div className="review-header">
        <button
          className="button-secondary print-button"
          onClick={() => window.print()}
          type="button"
        >
          <Printer size={13} style={{ verticalAlign: "-2px" }} /> Print / save
          PDF
        </button>
        <div className="section-kicker">Client review / scope snapshot</div>
        <h1>{review.title}</h1>
        <p>{review.analysis.summary}</p>
        <div className="review-meta">
          <span>{review.client}</span>
          <span>
            Prepared {new Date(review.snapshotCreatedAt).toLocaleDateString()}
          </span>
          <span className={`status status-${review.status}`}>
            {review.status.replace("_", " ")}
          </span>
        </div>
      </div>
      <section className="review-section">
        <div className="review-grid">
          <div>
            <h2>What this project is for</h2>
            <p style={{ color: "#8b8989", fontSize: 13 }}>
              {review.analysis.audience}
            </p>
            <ul className="review-list">
              {review.analysis.goals.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h2>Planned pages</h2>
            <div className="tag-list">
              {review.analysis.pages.map((page) => (
                <span className="tag" key={page}>
                  {page}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="review-section">
        <h2>Scope</h2>
        <div className="review-grid">
          <div>
            <h3 className="mono-label">Deliverables</h3>
            <ul className="review-list">
              {review.scope.deliverables.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mono-label">Included</h3>
            <ul className="review-list">
              {review.scope.included.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mono-label">Excluded</h3>
            <ul className="review-list">
              {review.scope.excluded.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mono-label">Revision rounds</h3>
            <p style={{ color: "#c7c3c3", fontSize: 14 }}>
              {review.scope.revisions} included review rounds
            </p>
          </div>
        </div>
      </section>
      <section className="review-section">
        <h2>Milestones</h2>
        {review.scope.milestones.map((milestone, index) => (
          <div className="review-milestone" key={`${milestone.name}-${index}`}>
            <div>
              <strong>{milestone.name}</strong>
              <span className="timing">{milestone.timing}</span>
            </div>
            <p>{milestone.detail}</p>
          </div>
        ))}
      </section>
      {locked && (
        <>
          <div className="locked-note" style={{ marginTop: 30 }}>
            <Check size={14} style={{ verticalAlign: "-2px" }} /> Approved by{" "}
            {review.approval?.name || "the client"}. The scope is locked; later
            work stays in separate change requests.
          </div>
          <section className="review-section change-request-public">
            <h2>Change requests</h2>
            <p className="section-intro">
              Request work outside the approved scope. The owner can reply with
              an explicit price and timeline.
            </p>
            {requests.length ? (
              requests.map((request) => (
                <article className="public-change-request" key={request.id}>
                  <div className="public-change-heading">
                    <div>
                      <strong>{request.title}</strong>
                      <span>
                        Requested by {request.requesterName} ·{" "}
                        {new Date(request.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <span
                      className={`status status-${request.status === "accepted" ? "approved" : request.status === "declined" ? "changes_requested" : "shared"}`}
                    >
                      {request.status}
                    </span>
                  </div>
                  <p>{request.details}</p>
                  {request.proposals.map((proposal) => (
                    <div className="public-proposal" key={proposal.id}>
                      <div className="public-proposal-heading">
                        <strong>
                          Proposal v{proposal.version}: {proposal.title}
                        </strong>
                        <span
                          className={`status status-${proposal.status === "accepted" ? "approved" : proposal.status === "declined" ? "changes_requested" : "shared"}`}
                        >
                          {proposal.status}
                        </span>
                      </div>
                      <p>{proposal.details}</p>
                      <dl>
                        <div>
                          <dt>Price adjustment</dt>
                          <dd>
                            {proposal.currency}{" "}
                            {proposal.priceAdjustment.toFixed(2)}
                          </dd>
                        </div>
                        <div>
                          <dt>Timeline</dt>
                          <dd>{proposal.timelineImpact}</dd>
                        </div>
                      </dl>
                      {proposal.affectedDeliverables.length > 0 && (
                        <p className="proposal-detail">
                          <strong>Affected:</strong>{" "}
                          {proposal.affectedDeliverables.join(", ")}
                        </p>
                      )}
                      <p className="proposal-detail">
                        <strong>Why:</strong> {proposal.rationale}
                      </p>
                      {proposal.decidedBy && (
                        <small>
                          Decision by {proposal.decidedBy} ·{" "}
                          {proposal.decisionComment || "No comment"}
                        </small>
                      )}
                      {proposal.status === "sent" && (
                        <div className="proposal-actions">
                          <button
                            className="button-primary"
                            disabled={loading}
                            onClick={() =>
                              decideProposal(proposal.id, "accepted")
                            }
                            type="button"
                          >
                            <Check
                              size={13}
                              style={{ verticalAlign: "-2px" }}
                            />{" "}
                            Accept proposal
                          </button>
                          <button
                            className="button-secondary"
                            disabled={loading}
                            onClick={() =>
                              decideProposal(proposal.id, "declined")
                            }
                            type="button"
                          >
                            Decline proposal
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </article>
              ))
            ) : (
              <p className="empty-history">No change requests yet.</p>
            )}
            <div className="public-request-form">
              <h3>Request a change</h3>
              <div className="field">
                <label htmlFor="change-request-title">Request title</label>
                <input
                  id="change-request-title"
                  onChange={(e) => setRequestTitle(e.target.value)}
                  placeholder="e.g. Add online booking"
                  value={requestTitle}
                />
              </div>
              <div className="field">
                <label htmlFor="change-request-details">
                  What would you like to add or change?
                </label>
                <textarea
                  id="change-request-details"
                  onChange={(e) => setRequestDetails(e.target.value)}
                  placeholder="Describe the outcome you need."
                  value={requestDetails}
                />
              </div>
              <button
                className="button-secondary"
                disabled={loading}
                onClick={requestChange}
                type="button"
              >
                <Send size={13} style={{ verticalAlign: "-2px" }} /> Send change
                request
              </button>
            </div>
          </section>
        </>
      )}
      <section className="review-actions">
        <h2>Leave a response</h2>
        <p>
          {locked
            ? "Send a separate note about the approved scope. Use Change requests above for new work."
            : "Ask a question, suggest an adjustment, or approve the scope as written."}
        </p>
        <div className="review-actions-grid">
          <div className="field">
            <label htmlFor="review-name">Your name</label>
            <input
              id="review-name"
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Jamie"
              value={name}
            />
          </div>
          <div className="field">
            <label htmlFor="review-comment">Comment</label>
            <textarea
              id="review-comment"
              onChange={(e) => setComment(e.target.value)}
              placeholder="A note for the project owner…"
              value={comment}
            />
          </div>
        </div>
        {error && <p className="form-error">{error}</p>}
        {message && <p className="form-success">{message}</p>}
        <div className="editor-bottom">
          <span style={{ color: "#777", fontSize: 13 }}>
            {review.comments.length} response
            {review.comments.length === 1 ? "" : "s"} on this snapshot.
          </span>
          <div className="editor-bottom-right">
            <button
              className="button-secondary"
              disabled={loading}
              onClick={() => respond("feedback")}
              type="button"
            >
              <Send size={13} style={{ verticalAlign: "-2px" }} /> Send feedback
            </button>
            {!locked && (
              <button
                className="button-primary"
                disabled={loading}
                onClick={() => respond("approval")}
                type="button"
              >
                {loading ? (
                  <LoaderCircle size={14} />
                ) : (
                  <>
                    <Check size={13} style={{ verticalAlign: "-2px" }} />{" "}
                    Approve scope
                  </>
                )}
              </button>
            )}
          </div>
        </div>
        {review.comments.map((item) => (
          <div className="review-comment" key={item.id}>
            <strong>
              {item.name}{" "}
              <span
                className={`status status-${item.action === "approval" ? "approved" : "changes_requested"}`}
                style={{ marginLeft: 5 }}
              >
                {item.action === "approval" ? "Approved" : "Feedback"}
              </span>
            </strong>
            <p>{item.comment}</p>
            <small>{new Date(item.createdAt).toLocaleString()}</small>
          </div>
        ))}
      </section>
    </main>
  );
}
