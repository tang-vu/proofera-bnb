import Link from "next/link";

import { loadMarketplaceLiveEvidence } from "../../lib/marketplace-live-evidence.server";
import type { MarketplaceCategory } from "../../lib/marketplace-query";

function utc(value: string): string {
  return `${new Date(value).toLocaleString("en-GB", { timeZone: "UTC" })} UTC`;
}

export async function LiveDecisionEvidence({
  category
}: Readonly<{ category: MarketplaceCategory }>) {
  const evidence = await loadMarketplaceLiveEvidence(category);
  const available = evidence.status === "available";

  return (
    <article
      aria-label="Selected-category live decision evidence"
      className="passport-panel"
      data-live-evidence-terminal-state={evidence.status}
    >
      <div className="passport-panel-heading">
        <div>
          <span className="step-number">LIVE</span>
          <h3>{evidence.title}</h3>
        </div>
        <span
          className={
            available
              ? "state-badge state-live"
              : evidence.status === "empty"
                ? "state-badge state-unknown"
                : "state-badge state-caution"
          }
        >
          {available
            ? "Source available"
            : evidence.status === "empty"
              ? "Source empty"
              : "Source unavailable"}
        </span>
      </div>

      <dl className="pancake-facts">
        <div>
          <dt>Source</dt>
          <dd>{evidence.source}</dd>
        </div>
        <div>
          <dt>Environment</dt>
          <dd>{evidence.environment.replaceAll("-", " ")}</dd>
        </div>
        <div>
          <dt>Observed</dt>
          <dd className="raw-value">
            {evidence.observedAt === null ? "Not established" : utc(evidence.observedAt)}
          </dd>
        </div>
        <div>
          <dt>Freshness</dt>
          <dd>{evidence.freshness}</dd>
        </div>
        <div>
          <dt>Method</dt>
          <dd className="raw-value">{evidence.methodology}</dd>
        </div>
        {evidence.facts.map((fact) => (
          <div key={fact.label}>
            <dt>{fact.label}</dt>
            <dd className="raw-value">{fact.value}</dd>
          </div>
        ))}
      </dl>

      <div className="decision-hold">
        <strong>{evidence.fallbackApplied ? "Fallback applied" : "No fallback applied"}</strong>
        <p>{evidence.boundary}</p>
      </div>
      <ul>
        {evidence.limitations.map((limitation) => (
          <li key={limitation}>{limitation}</li>
        ))}
      </ul>
      <div className="agent-card-actions">
        <Link className="text-link" href={evidence.sourceHref}>
          {evidence.sourceLinkLabel}
        </Link>
        <Link className="text-link" href={`/studio?agent=${category}`}>
          Activate analysis service
        </Link>
        <span className="locked-action">Capital execution disabled</span>
      </div>
    </article>
  );
}
