import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Check } from "lucide-react";
import { MarketingFooter } from "@/components/MarketingFooter";
import { MarketingHeader } from "@/components/MarketingHeader";
import { PricingCards } from "@/components/PricingCards";

export const metadata: Metadata = {
  title: "Illustrative pricing — Nexora",
  description: "Explore Nexora's free browser demo and illustrative portfolio pricing examples.",
};

export default function PricingPage() {
  return (
    <div className="marketing-page">
      <MarketingHeader />
      <main>
        <section className="detail-hero pricing-hero" id="demo">
          <div className="section-kicker">Illustrative pricing</div>
          <h1>Example plans. A free demo.</h1>
          <p>
            Nexora is free to explore in this portfolio demo. The Solo and
            Studio prices below are visual examples, not a live subscription
            service. Every card opens the same complete workflow.
          </p>
          <div className="demo-callout">
            <strong>All demo features are free.</strong> Prices are examples;
            there is no billing, account creation, payment, or paid feature gate
            connected to this demo.
          </div>
        </section>

        <section className="detail-section pricing-detail-section">
          <PricingCards />
        </section>

        <section className="detail-section compare-section">
          <div className="detail-section-heading">
            <div className="section-kicker">What works today</div>
            <h2>Every example tier opens the same useful core.</h2>
          </div>
          <div className="comparison-grid">
            <div className="comparison-item">
              <Check size={16} />
              <span>Built-in brief analysis and editable scope structure</span>
            </div>
            <div className="comparison-item">
              <Check size={16} />
              <span>Deliverables, inclusions, exclusions, milestones, and revisions</span>
            </div>
            <div className="comparison-item">
              <Check size={16} />
              <span>Review snapshots, approval locking, and response history</span>
            </div>
            <div className="comparison-item">
              <Check size={16} />
              <span>Change requests with explicit proposal and decision records</span>
            </div>
          </div>
        </section>

        <section className="detail-cta">
          <div>
            <div className="section-kicker">Free to explore</div>
            <h2>See the whole flow before deciding what it could become.</h2>
          </div>
          <Link className="button-primary" href="/workspace/new">
            Try the free demo <ArrowUpRight size={13} />
          </Link>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
