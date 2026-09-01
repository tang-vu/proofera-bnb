import type { Scan8004Agent, Scan8004AvailableResult } from "@proofera/integrations";
import Link from "next/link";
import { Suspense } from "react";

import {
  capitalLabel,
  marketplaceCategories,
  parseMarketplaceIntent,
  type MarketplaceSearchParams
} from "../../lib/marketplace-query";
import { referenceAgentCoverage } from "../../lib/reference-agent-coverage";
import { loadRegistryCandidates } from "../../lib/registry";
import { verifiedReferenceEvidenceForCategory } from "../../lib/verified-submission-evidence";
import { ComparisonSelectionForm } from "./comparison-selection";

export const metadata = {
  title: "Agent marketplace"
};

export const dynamic = "force-dynamic";

interface MarketplacePageProps {
  readonly searchParams: Promise<MarketplaceSearchParams>;
}

function shortenedAddress(value: string | null | undefined): string {
  if (value === null || value === undefined || value.length < 12) {
    return "Not supplied";
  }
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function cleanText(value: string | null | undefined, fallback: string, maximum: number): string {
  if (value === null || value === undefined) {
    return fallback;
  }

  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length === 0) {
    return fallback;
  }

  return cleaned.length > maximum ? `${cleaned.slice(0, maximum - 1)}…` : cleaned;
}

function CandidateCard({ agent }: Readonly<{ agent: Scan8004Agent }>) {
  const title = cleanText(agent.name, `Agent #${agent.token_id}`, 90);
  const description = cleanText(
    agent.description,
    "No description was supplied in the indexed registration metadata.",
    260
  );
  const protocols = agent.supported_protocols?.filter((value) => value.trim().length > 0) ?? [];

  return (
    <article className="agent-card">
      <label className="compare-check">
        <input name="agent" type="checkbox" value={`${agent.chain_id}:${agent.token_id}`} />
        Add to comparison
      </label>
      <div className="agent-card-topline">
        <span className="state-badge state-live">BSC identity observed</span>
        <span className="state-badge state-caution">Capability unverified</span>
      </div>
      <div>
        <p className="mono-kicker">ERC-8004 · #{agent.token_id}</p>
        <h3>{title}</h3>
        <p className="agent-summary">{description}</p>
      </div>
      <dl className="agent-facts">
        <div>
          <dt>Owner</dt>
          <dd>{shortenedAddress(agent.owner_address)}</dd>
        </div>
        <div>
          <dt>8004scan score</dt>
          <dd>
            {agent.total_score === null || agent.total_score === undefined
              ? "Unknown"
              : agent.total_score.toFixed(1)}
          </dd>
        </div>
        <div>
          <dt>Feedback sample</dt>
          <dd>{agent.total_feedbacks ?? "Unknown"}</dd>
        </div>
        <div>
          <dt>Self-declared protocols</dt>
          <dd>
            {protocols.length === 0
              ? "Not supplied"
              : cleanText(protocols.join(", "), "Not supplied", 80)}
          </dd>
        </div>
      </dl>
      <div className="agent-card-actions">
        <Link
          className="text-link"
          href={`/agents/${agent.chain_id}/${encodeURIComponent(agent.token_id)}`}
        >
          Open evidence passport
        </Link>
        <a
          className="text-link"
          href={`https://www.8004scan.io/agents/bsc/${encodeURIComponent(agent.token_id)}`}
          rel="noreferrer"
          target="_blank"
        >
          Source <span aria-hidden="true">↗</span>
        </a>
        <span className="locked-action" title="A verified Agent Passport is required first">
          Activation locked
        </span>
      </div>
    </article>
  );
}

function RegistryStatus({
  result,
  terminalState
}: Readonly<{
  result: Scan8004AvailableResult;
  terminalState?: "available";
}>) {
  return (
    <div
      aria-label="Registry evidence available"
      className="source-status"
      data-registry-terminal-state={terminalState}
      role="status"
    >
      <div>
        <span className="status-dot" aria-hidden="true" />
        <strong>Live 8004scan response</strong>
      </div>
      <span>
        Source timestamp{" "}
        {new Date(result.meta.timestamp).toLocaleString("en-GB", { timeZone: "UTC" })} UTC
      </span>
      {result.rateLimit.remaining === null ? null : (
        <span>{result.rateLimit.remaining} requests remain in the current upstream window</span>
      )}
    </div>
  );
}

function RegistryPending() {
  return (
    <div
      aria-atomic="true"
      aria-busy="true"
      aria-label="Registry evidence pending"
      aria-live="polite"
      className="source-status"
      role="status"
    >
      <div>
        <span aria-hidden="true" className="status-dot status-dot-pending" />
        <strong>Refreshing live 8004scan evidence</strong>
      </div>
      <span>
        The intent controls and repository-backed analyzer dossiers remain available while this
        independent source request completes.
      </span>
    </div>
  );
}

function readRegistryTestDelay(): number {
  if (process.env.NODE_ENV === "production") {
    return 0;
  }

  const rawDelay = process.env.PROOFERA_E2E_REGISTRY_DELAY_MS;
  if (rawDelay === undefined || !/^\d{1,5}$/.test(rawDelay)) {
    return 0;
  }

  return Math.min(Number(rawDelay), 10_000);
}

async function RegistryResults({
  category
}: Readonly<{ category: keyof typeof marketplaceCategories }>) {
  const testDelay = readRegistryTestDelay();
  if (testDelay > 0) {
    await new Promise((resolve) => setTimeout(resolve, testDelay));
  }

  const registry = await loadRegistryCandidates(category);

  if (registry.status === "unavailable") {
    return (
      <div
        aria-label="Registry evidence unavailable"
        className="unavailable-panel"
        data-registry-terminal-state="unavailable"
        role="alert"
      >
        <div>
          <span className="state-badge state-caution">Source unavailable</span>
          <h3>Registry evidence could not be refreshed.</h3>
          <p>{registry.message}</p>
        </div>
        <dl>
          <div>
            <dt>Observed</dt>
            <dd>
              {new Date(registry.observedAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC
            </dd>
          </div>
          <div>
            <dt>Failure class</dt>
            <dd>{registry.reason.replaceAll("_", " ")}</dd>
          </div>
          <div>
            <dt>Fallback</dt>
            <dd>None — no fixtures substituted</dd>
          </div>
        </dl>
      </div>
    );
  }

  return (
    <>
      <RegistryStatus
        result={registry}
        {...(registry.agents.length > 0 ? { terminalState: "available" } : {})}
      />
      {registry.agents.length === 0 ? (
        <div
          aria-label="Registry search returned no matching identities"
          className="empty-panel"
          data-registry-terminal-state="empty"
          role="status"
        >
          <h3>No matching identities were returned.</h3>
          <p>
            This is a valid empty result, not an integration failure and not proof that no agent
            exists.
          </p>
        </div>
      ) : (
        <ComparisonSelectionForm>
          <div className="agent-grid">
            {registry.agents.map((agent) => (
              <CandidateCard agent={agent} key={`${agent.chain_id}:${agent.token_id}`} />
            ))}
          </div>
        </ComparisonSelectionForm>
      )}
    </>
  );
}

export default async function MarketplacePage({ searchParams }: MarketplacePageProps) {
  const intent = parseMarketplaceIntent(await searchParams);
  const category = marketplaceCategories[intent.category];

  return (
    <main id="main-content" tabIndex={-1}>
      <header className="shell marketplace-hero marketplace-hero-layout">
        <div>
          <span className="eyebrow">INTENT BEFORE INVENTORY</span>
          <h1>Start with the job.</h1>
          <p className="lede">
            ProofEra narrows the market by your constraints, then separates an onchain identity from
            evidence that its strategy is safe, current, and effective.
          </p>
        </div>
        <aside className="decision-path" aria-label="ProofEra marketplace decision path">
          <div className="decision-path-head">
            <span>DECISION PATH</span>
            <span>03 GATES</span>
          </div>
          <ol>
            <li>
              <span>01</span>
              <strong>Define</strong>
              <small>Capital + risk</small>
            </li>
            <li>
              <span>02</span>
              <strong>Separate</strong>
              <small>Identity ≠ evidence</small>
            </li>
            <li>
              <span>03</span>
              <strong>Hold</strong>
              <small>Until proof is complete</small>
            </li>
          </ol>
          <p>
            <i aria-hidden="true" /> Recommendation remains withheld by default
          </p>
        </aside>
      </header>

      <section className="shell intent-layout" aria-labelledby="intent-heading">
        <form className="intent-form" method="get">
          <div className="panel-heading">
            <span className="step-number">01</span>
            <div>
              <p className="panel-overline">YOUR BOUNDARIES</p>
              <h2 id="intent-heading">Define the mandate</h2>
            </div>
          </div>

          <label>
            Financial job
            <select defaultValue={intent.category} name="category">
              {Object.entries(marketplaceCategories).map(([value, item]) => (
                <option key={value} value={value}>
                  {item.shortGoal}
                </option>
              ))}
            </select>
          </label>
          <div className="form-grid">
            <label>
              Capital range
              <select defaultValue={intent.capital} name="capital">
                <option value="under-100">Under $100</option>
                <option value="100-1000">$100–$1,000</option>
                <option value="1000-10000">$1,000–$10,000</option>
                <option value="over-10000">$10,000+</option>
              </select>
            </label>
            <label>
              Risk tolerance
              <select defaultValue={intent.risk} name="risk">
                <option value="conservative">Conservative</option>
                <option value="balanced">Balanced</option>
                <option value="adventurous">Adventurous</option>
              </select>
            </label>
            <label>
              Horizon
              <select defaultValue={intent.horizon} name="horizon">
                <option value="days">Days</option>
                <option value="weeks">Weeks</option>
                <option value="months">Months</option>
              </select>
            </label>
            <label>
              Preferred assets
              <select defaultValue={intent.asset} name="asset">
                <option value="any">Any supported asset</option>
                <option value="stablecoins">Stablecoins</option>
                <option value="bnb">BNB</option>
                <option value="cake">CAKE</option>
              </select>
            </label>
          </div>
          <button className="button button-primary" type="submit">
            Apply boundaries
          </button>
        </form>

        <aside className="intent-readout" aria-label="Current mandate">
          <p className="panel-overline">CURRENT MANDATE</p>
          <h2>{category.label}</h2>
          <dl>
            <div>
              <dt>Capital</dt>
              <dd>{capitalLabel(intent.capital)}</dd>
            </div>
            <div>
              <dt>Risk</dt>
              <dd>{intent.risk}</dd>
            </div>
            <div>
              <dt>Horizon</dt>
              <dd>{intent.horizon}</dd>
            </div>
            <div>
              <dt>Evidence needed</dt>
              <dd>{category.evidenceFocus}</dd>
            </div>
          </dl>
          <div className="decision-hold">
            <strong>Recommendation withheld</strong>
            <p>
              An identity search is not enough to rank suitability or let an agent control capital.
            </p>
          </div>
        </aside>
      </section>

      <section className="shell section" aria-labelledby="reference-coverage-heading">
        <div className="section-heading">
          <div>
            <span className="eyebrow">02 · FIRST-PARTY DEVELOPMENT COVERAGE</span>
            <h2 id="reference-coverage-heading">
              Four registered analyzers. Zero invented performance.
            </h2>
          </div>
          <p>
            These repository-backed analyzers define the evidence contract for every required
            category and have finalized BSC-testnet identities. Registration alone does not make
            them recommendations, performance records, marketplace-eligible, or hireable.
          </p>
        </div>
        <div className="category-grid">
          {referenceAgentCoverage.map((reference) => {
            const evidence = verifiedReferenceEvidenceForCategory(reference.category);
            return (
              <article className="category-card" key={reference.category}>
                <div className="agent-card-topline">
                  <span className="state-badge state-available">BSC testnet registered</span>
                  <span className="state-badge state-caution">Execution disabled</span>
                </div>
                <p className="mono-kicker">{reference.skill}</p>
                <h3>{reference.name}</h3>
                <p>{reference.boundary}</p>
                <ul>
                  {reference.evidenceFocus.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <p className="registry-footnote">
                  <strong>Method:</strong> {reference.methodologyVersion}
                  <br />
                  <strong>Registration:</strong> finalized on BSC testnet · Agent ID{" "}
                  {evidence.agentId}
                  <br />
                  <strong>Paid hire receipts:</strong> {evidence.paidHireReceipts.length} finalized
                  · task completion not inferred
                  <br />
                  <strong>Current marketplace eligibility:</strong> false
                </p>
                <div className="agent-card-actions">
                  <Link className="text-link" href={`/studio?agent=${reference.category}`}>
                    Run live analyzer
                  </Link>
                  <Link className="text-link" href={`/reference-analyzers/${reference.category}`}>
                    Open {reference.name} dossier
                  </Link>
                  {reference.category === "health-factor-monitoring" ? (
                    <Link className="text-link" href="/venus-health">
                      Open raw Venus evidence reader
                    </Link>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section
        className="shell registry-section"
        id="registry-results"
        aria-labelledby="registry-heading"
      >
        <div className="section-heading registry-heading">
          <div>
            <span className="eyebrow">03 · LIVE IDENTITY INGRESS</span>
            <h2 id="registry-heading">Registry candidates, not endorsements.</h2>
          </div>
          <p>
            These records matched “{category.registrySearch}” in 8004scan. ProofEra does not infer
            working endpoints, category fitness, performance, or safe permissions from metadata.
          </p>
        </div>

        <Suspense fallback={<RegistryPending />}>
          <RegistryResults category={intent.category} />
        </Suspense>

        <footer className="registry-footnote">
          <strong>Why every activation is locked here:</strong> a complete Agent Passport still
          needs endpoint checks, source-linked outcomes, permission review, freshness, and a
          verified revoke path. The upstream score shown above is not the ProofEra Proof Score.
        </footer>
      </section>
    </main>
  );
}
