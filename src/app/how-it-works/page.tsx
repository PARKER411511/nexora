import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Check, MessageCircle, ShieldCheck } from "lucide-react";
import { MarketingFooter } from "@/components/MarketingFooter";
import { MarketingHeader } from "@/components/MarketingHeader";

export const metadata: Metadata = {
  title: "How it works — Nexora",
  description: "See how Nexora turns a rough web brief into a reviewable scope and a clear change process.",
};

const stages = [
  {
    number: "01",
    title: "Capture the brief",
    text: "Paste the brief as it arrived. Keep the useful uncertainty instead of trying to sound finished too early.",
    detail: "Prompt: what is changing, who is it for, and what would make the project feel successful?",
  },
  {
    number: "02",
    title: "Analyze the shape",
    text: "Nexora surfaces audience, goals, likely pages, needs, risks, and questions for the first conversation.",
    detail: "The built-in analyzer runs locally and is labelled clearly. You can edit every result before it becomes scope.",
  },
  {
    number: "03",
    title: "Build the scope",
    text: "Turn the analysis into deliverables, included work, exclusions, milestones, and revision rounds.",
    detail: "The boundary is part of the deliverable: an explicit out-of-scope list gives the next conversation somewhere to start.",
  },
  {
    number: "04",
    title: "Share for review",
    text: "Send a snapshot that a client can read without opening the owner editor. They can leave feedback or approve.",
    detail: "In the free browser demo, the review link works in the same browser profile and device that created it.",
  },
  {
    number: "05",
    title: "Lock the approval",
    text: "Approval freezes the exact scope that was reviewed. The owner can still see earlier feedback and superseded snapshots.",
    detail: "A saved approval does not silently change when a later idea appears.",
  },
  {
    number: "06",
    title: "Handle the next request",
    text: "A client can submit a separate change request. The owner writes the price, affected deliverables, rationale, and timeline impact.",
    detail: "The client accepts or declines the proposal; the approved baseline remains unchanged either way.",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="marketing-page">
      <MarketingHeader />
      <main>
        <section className="detail-hero">
          <div className="section-kicker">How it works</div>
          <h1>Give every project a clear next conversation.</h1>
          <p>
            Nexora keeps the path from messy brief to approved scope visible. It
            helps you ask better questions, make the boundary concrete, and keep
            later changes honest.
          </p>
          <div className="detail-hero-actions">
            <Link className="button-primary" href="/workspace/new">
              Try the free demo <ArrowUpRight size={13} />
            </Link>
            <span className="detail-note">
              Free to explore · no account or checkout
            </span>
          </div>
        </section>

        <section className="detail-section stage-section">
          <div className="detail-section-heading">
            <div className="section-kicker">The workflow</div>
            <h2>Six small decisions that keep the work moving.</h2>
          </div>
          <div className="stage-grid">
            {stages.map((stage) => (
              <article className="stage-card" key={stage.number}>
                <span className="stage-number">{stage.number}</span>
                <h3>{stage.title}</h3>
                <p>{stage.text}</p>
                <span className="stage-detail">{stage.detail}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="detail-section example-section" id="scope-preview">
          <div className="detail-section-heading">
            <div className="section-kicker">Concrete example · fictional project</div>
            <h2>What a useful scope can say in one screen.</h2>
          </div>
          <div className="scope-preview scope-preview-large">
            <div className="scope-preview-head">
              <div>
                <span className="mono-label">Example / fictional · Northstar Gym</span>
                <h3>Membership site and booking path</h3>
              </div>
              <span className="status status-shared">Review</span>
            </div>
            <div className="scope-preview-grid">
              <div>
                <span>Audience</span>
                <strong>Local members and first-time visitors</strong>
              </div>
              <div>
                <span>Deliverables</span>
                <strong>Responsive site, content structure, booking links</strong>
              </div>
              <div>
                <span>Included</span>
                <strong>Home, classes, membership, contact, launch QA</strong>
              </div>
              <div>
                <span>Excluded</span>
                <strong>Custom payment system and staff dashboard</strong>
              </div>
              <div>
                <span>Milestones</span>
                <strong>Structure → content → build → review → launch</strong>
              </div>
              <div>
                <span>Revisions</span>
                <strong>Two consolidated review rounds</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="detail-section principles-strip">
          <div className="principle-point">
            <ShieldCheck size={19} />
            <div>
              <h3>Approval is a snapshot</h3>
              <p>Approved work stays readable even when the project keeps moving.</p>
            </div>
          </div>
          <div className="principle-point">
            <MessageCircle size={19} />
            <div>
              <h3>Changes get a place</h3>
              <p>New requests become visible proposals instead of quiet scope drift.</p>
            </div>
          </div>
          <div className="principle-point">
            <Check size={19} />
            <div>
              <h3>Export when you are ready</h3>
              <p>Keep a Markdown scope or use the review page print view for a PDF.</p>
            </div>
          </div>
        </section>

        <section className="detail-cta">
          <div>
            <div className="section-kicker">Try it with a real brief</div>
            <h2>Start with the words you already have.</h2>
          </div>
          <Link className="button-primary" href="/workspace/new">
            Open the free demo <ArrowUpRight size={13} />
          </Link>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}