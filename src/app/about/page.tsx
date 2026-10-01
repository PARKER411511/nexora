import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Eye, LockKeyhole, MessagesSquare } from "lucide-react";
import { MarketingFooter } from "@/components/MarketingFooter";
import { MarketingHeader } from "@/components/MarketingHeader";

export const metadata: Metadata = {
  title: "About Nexora — Clear project conversations",
  description: "Learn why Nexora exists and the principles behind its brief-to-scope workflow.",
};

const principles = [
  {
    icon: Eye,
    title: "Make the boundary visible",
    text: "A clear exclusions list and revision count help good work start with the same picture.",
  },
  {
    icon: LockKeyhole,
    title: "Protect the approved moment",
    text: "Approval records the scope that was actually reviewed, so later requests can be discussed honestly.",
  },
  {
    icon: MessagesSquare,
    title: "Keep decisions in the room",
    text: "Feedback, proposals, and decisions should be easy to find when a project gets busy.",
  },
];

export default function AboutPage() {
  return (
    <div className="marketing-page">
      <MarketingHeader />
      <main>
        <section className="detail-hero about-hero">
          <div className="section-kicker">About Nexora</div>
          <h1>Better project conversations start before the interface.</h1>
          <p>
            Nexora is a focused workspace for independent designers and
            developers who need to turn a rough brief into a shared, readable
            scope. It gives the early decisions a calm place to land.
          </p>
          <Link className="button-primary" href="/workspace/new">
            Try the free demo <ArrowUpRight size={13} />
          </Link>
        </section>

        <section className="detail-section about-story">
          <div className="about-story-copy">
            <div className="section-kicker">The purpose</div>
            <h2>Clarity is part of the craft.</h2>
            <p>
              A project rarely becomes difficult because nobody can make a good
              screen. It becomes difficult when the brief, assumptions, timing,
              and responsibilities live in different places. Nexora is designed
              around that earlier moment, when making the work legible is the
              most valuable thing you can do.
            </p>
            <p>
              The current product is intentionally small and honest: a free
              browser demo, a private local workspace, a built-in analyzer, and
              a visible way to handle work that appears after approval.
            </p>
          </div>
          <div className="about-statements">
            <div>
              <strong>01</strong>
              <span>Brief in</span>
              <p>Keep the original context close to the decisions.</p>
            </div>
            <div>
              <strong>02</strong>
              <span>Scope out</span>
              <p>Make included and excluded work concrete.</p>
            </div>
            <div>
              <strong>03</strong>
              <span>Changes visible</span>
              <p>Give new requests their own proposal and outcome.</p>
            </div>
          </div>
        </section>

        <section className="detail-section" id="changes">
          <div className="detail-section-heading">
            <div className="section-kicker">Principles</div>
            <h2>Small rules that make the workspace useful.</h2>
          </div>
          <div className="principle-grid">
            {principles.map(({ icon: Icon, title, text }) => (
              <article className="principle-card" key={title}>
                <Icon className="feature-icon" size={20} />
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="detail-section privacy-section" id="privacy">
          <div>
            <div className="section-kicker">Honest limits</div>
            <h2>Private by default in this demo.</h2>
          </div>
          <div className="privacy-copy">
            <p>
              Projects are saved only in this browser. Clearing this site’s
              data removes saved projects and review links. A copied review URL
              will not reveal the project from another browser profile or device.
            </p>
            <p>
              There are no accounts, billing charges, public cloud projects, or
              team permissions connected to this demo.
            </p>
          </div>
        </section>

        <section className="detail-cta">
          <div>
            <div className="section-kicker">Make a brief easier to discuss</div>
            <h2>Bring the next conversation into focus.</h2>
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