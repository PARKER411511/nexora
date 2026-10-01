import Link from "next/link";
import {
  ArrowUpRight,
  Code2,
  FileText,
  Globe2,
  Layers3,
  MessageSquare,
  Minus,
  Milestone,
  PenTool,
  Plus,
  Play,
} from "lucide-react";
import { MarketingFooter } from "@/components/MarketingFooter";
import { MarketingHeader } from "@/components/MarketingHeader";
import { PricingCards } from "@/components/PricingCards";

const features = [
  {
    icon: FileText,
    title: "Brief analysis",
    text: "Turn a loose client note into goals, pages, risks, and questions that unblock the first call.",
  },
  {
    icon: Layers3,
    title: "Scope builder",
    text: "Shape deliverables, included work, exclusions, milestones, and revision rounds before expectations drift.",
  },
  {
    icon: Milestone,
    title: "Milestone planning",
    text: "Give the work a useful sequence so every review has a clear reason and next step.",
  },
  {
    icon: MessageSquare,
    title: "Approvals & changes",
    text: "Share an immutable snapshot, collect feedback, and handle later requests with a visible proposal.",
  },
];

const useCases = [
  {
    icon: Globe2,
    title: "Marketing websites",
    text: "Turn a discovery call into a page list, content assumptions, and a reviewable first scope.",
  },
  {
    icon: PenTool,
    title: "Independent design work",
    text: "Make rounds, boundaries, and handoff points clear before the first polished screen.",
  },
  {
    icon: Code2,
    title: "Small web builds",
    text: "Keep integrations, exclusions, and timeline impact visible when the brief grows new edges.",
  },
];

const faqs = [
  {
    question: "Is Nexora an AI product?",
    answer:
      "The built-in analyzer is a transparent local tool that works immediately. An optional AI mode can help when configured.",
  },
  {
    question: "Can a client change an approved scope?",
    answer:
      "Approval locks the snapshot. A later note becomes a separate change request with an explicit proposal and decision.",
  },
  {
    question: "Where does the free demo save project data?",
    answer:
      "The browser demo keeps projects in this browser. Review links work on the same browser profile and device.",
  },
  {
    question: "Are the paid prices real?",
    answer:
      "No. Solo and Studio prices are illustrative portfolio examples. The whole current demo is free and has no billing flow.",
  },
];
export default function Home() {
  return (
    <>
      <MarketingHeader />
      <section className="landing-hero">
        <div aria-hidden="true" className="hero-art-layer">
          <div className="hero-orbit" />
        </div>
        <div className="hero-grid">
          <div className="hero-copy">
            <div className="eyebrow">A calmer way to scope digital work</div>
            <h1>
              Clear scope.
              <br />
              Smoother projects<span>.</span>
            </h1>
            <p>
              Nexora turns an unstructured web brief into a practical plan your
              client can understand, review, and approve.
            </p>
            <div className="hero-actions">
              <Link className="button-primary" href="/workspace/new">
                Try the free demo <ArrowUpRight size={13} />
              </Link>
              <Link className="play-link" href="/how-it-works">
                <span>
                  <Play fill="currentColor" size={10} />
                </span>
                See how it works
              </Link>
            </div>
            <div className="hero-stats">
              <div className="hero-stat">
                <strong>01</strong>
                <small>brief to scope</small>
              </div>
              <div className="hero-stat">
                <strong>04</strong>
                <small>scope building blocks</small>
              </div>
              <div className="hero-stat">
                <strong>01</strong>
                <small>approval snapshot</small>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="trust-row">
        <span>MADE FOR INDEPENDENT TEAMS</span>
        <span>Designer-led</span>
        <span>Developer-ready</span>
        <span>Client-readable</span>
        <span>Private by default</span>
      </div>

      <main>
        <section className="landing-section section-split" id="product">
          <div>
            <div className="section-kicker">01 — The problem</div>
            <h2 className="section-title">A more capable first conversation.</h2>
            <p className="section-copy">
              The strongest projects start before the first screen is designed.
              Nexora gives the brief somewhere useful to go: into a shared scope
              that makes decisions, trade-offs, and ownership visible.
            </p>
            <div className="problem-actions">
              <Link className="button-secondary" href="/workspace/new">
                Start with a brief <ArrowUpRight size={13} />
              </Link>
              <Link className="text-link" href="/about">
                Why we built Nexora <ArrowUpRight size={13} />
              </Link>
            </div>
          </div>
          <div
            aria-label="Abstract red light across a dark surface"
            className="about-art"
            role="img"
          />
        </section>

        <section className="landing-section" id="features">
          <div className="feature-head">
            <div>
              <div className="section-kicker">02 — What you get</div>
              <h2 className="section-title">
                Everything you need to make the work legible.
              </h2>
            </div>
            <p className="section-copy">
              A small, focused workspace for the part of a project where clarity
              pays off most.
            </p>
          </div>
          <div className="feature-grid">
            {features.map(({ icon: Icon, title, text }) => (
              <article className="feature-card" key={title}>
                <Icon className="feature-icon" size={19} />
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section output-section" id="output">
          <div className="section-kicker">03 — The output</div>
          <div className="output-grid">
            <div>
              <h2 className="section-title">A scope clients can actually react to.</h2>
              <p className="section-copy">
                Start with the messy context, then turn it into a compact plan:
                who it is for, what gets made, what stays out, and how the work
                moves from one review to the next.
              </p>
              <Link className="text-link" href="/how-it-works#scope-preview">
                See a scope example <ArrowUpRight size={13} />
              </Link>
            </div>
            <div className="scope-preview" aria-label="Example scope preview">
              <div className="scope-preview-head">
                <span className="mono-label">Example / northstar gym</span>
                <span className="status status-shared">Review</span>
              </div>
              <h3>Membership site and booking path</h3>
              <div className="scope-preview-grid">
                <div>
                  <span>Audience</span>
                  <strong>Local members and first-time visitors</strong>
                </div>
                <div>
                  <span>Included</span>
                  <strong>Home, classes, membership, contact</strong>
                </div>
                <div>
                  <span>Out of scope</span>
                  <strong>Custom payments and staff dashboard</strong>
                </div>
                <div>
                  <span>Next review</span>
                  <strong>Pages and content assumptions</strong>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-section" id="workflow">
          <div className="workflow-grid">
            <div>
              <div className="section-kicker">04 — How it works</div>
              <h2 className="section-title">From raw notes to a confident yes.</h2>
              <p className="section-copy">
                The detailed workflow keeps the useful questions in order while
                leaving the final decisions with you and your client.
              </p>
              <Link className="button-secondary" href="/how-it-works">
                Explore the full workflow <ArrowUpRight size={13} />
              </Link>
            </div>
            <div className="step-list">
              <div className="step">
                <div className="step-num">01</div>
                <h3>Capture the brief</h3>
                <p>Paste the words as they arrived. Keep the messy context.</p>
              </div>
              <div className="step">
                <div className="step-num">02</div>
                <h3>Build the scope</h3>
                <p>Edit the useful structure: pages, work, timing, and limits.</p>
              </div>
              <div className="step">
                <div className="step-num">03</div>
                <h3>Share & approve</h3>
                <p>Send a snapshot. Feedback stays visible and approval locks it.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-section use-case-section" id="use-cases">
          <div className="section-kicker">05 — Made for the work</div>
          <div className="feature-head">
            <h2 className="section-title">Useful before the first pixel.</h2>
            <p className="section-copy">
              Use the same calm structure for the projects that tend to grow
              between a good conversation and a clear yes.
            </p>
          </div>
          <div className="use-case-grid">
            {useCases.map(({ icon: Icon, title, text }) => (
              <article className="use-case-card" key={title}>
                <Icon className="feature-icon" size={20} />
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section pricing-section" id="pricing">
          <div className="section-kicker">06 — Illustrative pricing</div>
          <div className="feature-head">
            <div>
              <h2 className="section-title">Three ways to picture the product.</h2>
              <p className="section-copy">
                These are example bundles for the portfolio demo. Every card
                opens the same free working demo; there is no checkout or paid
                feature gate.
              </p>
            </div>
            <Link className="text-link" href="/pricing">
              View pricing detail <ArrowUpRight size={13} />
            </Link>
          </div>
          <PricingCards compact />
        </section>

        <section className="landing-section" id="faq">
          <div className="faq-layout">
            <div>
              <div className="section-kicker">07 — FAQ</div>
              <h2 className="section-title">A few useful answers.</h2>
            </div>
            <div className="faq-list">
              {faqs.map(({ answer, question }) => (
                <details className="faq-item" key={question}>
                  <summary>
                    <span>{question}</span>
                    <span aria-hidden="true" className="faq-icon">
                      <Plus className="faq-icon-open" size={16} />
                      <Minus className="faq-icon-close" size={16} />
                    </span>
                  </summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-section landing-cta">
          <div>
            <div className="section-kicker">Ready to get started?</div>
            <h2 className="section-title">
              Turn your next brief
              <br />
              into something clear.
            </h2>
            <Link className="button-primary" href="/workspace/new">
              Try the free demo <ArrowUpRight size={13} />
            </Link>
          </div>
          <div aria-hidden="true" className="orbit-core" />
        </section>
      </main>

      <MarketingFooter />
    </>
  );
}
