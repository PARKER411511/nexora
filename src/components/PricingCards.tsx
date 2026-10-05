import Link from "next/link";

const plans = [
  {
    name: "Free workspace",
    price: "$0",
    cadence: "always",
    description: "Try the complete brief-to-scope flow in a private account.",
    items: [
      "Built-in brief analysis",
      "Scope and milestone editing",
      "Review, approval, and change flow",
    ],
    cta: "Open workspace",
    href: "/workspace",
    label: "Available now",
    featured: true,
  },
  {
    name: "Solo",
    price: "$12",
    cadence: "/ month",
    description: "An example bundle for an independent designer or developer.",
    items: [
      "Everything in Free workspace",
      "A private project library",
      "Reusable scope templates",
    ],
    cta: "Explore workspace",
    href: "/workspace",
    label: "Example price",
    featured: false,
  },
  {
    name: "Studio",
    price: "$29",
    cadence: "/ month",
    description: "An example bundle for a small team shaping work together.",
    items: [
      "Everything in Solo",
      "Shared project handoffs",
      "Team-level workspace views",
    ],
    cta: "Explore workspace",
    href: "/workspace",
    label: "Example price",
    featured: false,
  },
];

export function PricingCards({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`pricing-grid${compact ? " pricing-grid-compact" : ""}`}>
      {plans.map((plan) => (
        <article
          className={`pricing-card${plan.featured ? " featured" : ""}`}
          key={plan.name}
        >
          <div className="pricing-card-top">
            <span className="pricing-label">{plan.label}</span>
            {!plan.featured && (
              <span className="pricing-example-note">
                Example package includes
              </span>
            )}
            <h3>{plan.name}</h3>
          </div>
          <div className="pricing-price">
            <strong>{plan.price}</strong>
            <span>{plan.cadence}</span>
          </div>
          <p>{plan.description}</p>
          <ul>
            {plan.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <Link
            className={plan.featured ? "button-primary" : "button-secondary"}
            href={plan.href}
          >
            {plan.cta}
          </Link>
        </article>
      ))}
    </div>
  );
}
