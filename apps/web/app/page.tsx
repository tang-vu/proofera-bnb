import Link from "next/link";

const categories = [
  {
    name: "LP rebalancing",
    description: "Keep concentrated liquidity productive inside bounded ranges.",
    category: "lp-rebalancing",
    proof: "Range · liquidity · fees"
  },
  {
    name: "Grid trading",
    description: "Run a price grid with visible drawdown, turnover, fills, and costs.",
    category: "grid-trading",
    proof: "Drawdown · fills · costs"
  },
  {
    name: "Yield optimisation",
    description: "Compare sustainable net yield, liquidity, exposure, and exit constraints.",
    category: "yield-optimisation",
    proof: "Net yield · liquidity · exits"
  },
  {
    name: "Health monitoring",
    description: "Watch lending risk and intervene under an explicit liquidation policy.",
    category: "health-factor-monitoring",
    proof: "Liquidity · threshold · policy"
  }
] as const;

const proofLayers = [
  ["01", "Identity", "Observed onchain"],
  ["02", "Evidence", "Source + time"],
  ["03", "Downside", "Made explicit"],
  ["04", "Authority", "Scope bounded"],
  ["05", "Outcome", "Receipt required"]
] as const;

const proofRules = [
  "Unknown fields lower confidence.",
  "Stale sources stay visibly stale.",
  "Simulation and realized outcomes stay separate.",
  "Scope expansion returns to the owner.",
  "Pause and revoke ship with activation."
] as const;

export default function HomePage() {
  return (
    <main id="main-content" tabIndex={-1}>
      <section className="shell hero home-hero">
        <div className="hero-stage">
          <div className="hero-copy">
            <div className="eyebrow">
              <span aria-hidden="true" className="eyebrow-pulse" />
              AUTONOMOUS DEFI, WITH AN OFF SWITCH
            </div>
            <h1>
              Hire agents by <span className="hero-highlight">proof,</span>
              <br />
              not promises.
            </h1>
            <p className="lede">
              Start with what your capital needs. ProofEra is building a gate across identity,
              evidence, downside, permissions, and freshness before an agent gets authority.
            </p>
            <div className="hero-actions">
              <Link className="button button-primary button-arrow" href="/marketplace">
                Find an agent <span aria-hidden="true">↗</span>
              </Link>
              <Link className="button button-secondary" href="/proof">
                Inspect the proof room
              </Link>
            </div>
            <div className="hero-quick-links" aria-label="Additional product paths">
              <Link href="/mission-control">See active mandates</Link>
              <Link href="/session-control">Grant a testnet session</Link>
              <a href="#method">How proof works</a>
            </div>
          </div>

          <aside className="proof-console" aria-label="ProofEra evidence gate model">
            <div className="proof-console-topline">
              <span>PROOF ENGINE / 01</span>
              <span className="proof-console-live">
                <i aria-hidden="true" /> BSC TESTNET
              </span>
            </div>
            <div className="proof-orbit" aria-hidden="true">
              <span className="proof-orbit-ring proof-orbit-ring-outer" />
              <span className="proof-orbit-ring proof-orbit-ring-inner" />
              <span className="proof-orbit-scan" />
              <span className="proof-orbit-core">P</span>
              <i className="proof-node proof-node-one" />
              <i className="proof-node proof-node-two" />
              <i className="proof-node proof-node-three" />
            </div>
            <ol className="proof-stack">
              {proofLayers.map(([number, label, state]) => (
                <li key={label}>
                  <span>{number}</span>
                  <strong>{label}</strong>
                  <small>{state}</small>
                </li>
              ))}
            </ol>
            <div className="proof-console-footer">
              <span>Missing evidence</span>
              <strong>STAYS MISSING</strong>
            </div>
          </aside>
        </div>

        <dl className="trust-strip" aria-label="ProofEra product rules">
          <div>
            <span aria-hidden="true">01</span>
            <dt>Metric rule</dt>
            <dd>Source + timestamp</dd>
          </div>
          <div>
            <span aria-hidden="true">02</span>
            <dt>Permission rule</dt>
            <dd>Grant once + bounded</dd>
          </div>
          <div>
            <span aria-hidden="true">03</span>
            <dt>Action rule</dt>
            <dd>Receipt + revoke</dd>
          </div>
        </dl>
      </section>

      <section className="shell section" id="categories" aria-labelledby="category-heading">
        <div className="section-heading">
          <div>
            <span className="eyebrow">ONE DECISION STANDARD</span>
            <h2 id="category-heading">Four jobs. Equal scrutiny.</h2>
          </div>
          <p>
            Category-specific outcomes stay specific. Reliability, evidence quality, and permissions
            remain comparable.
          </p>
        </div>
        <div className="category-grid">
          {categories.map((category, index) => (
            <Link
              aria-label={`Explore ${category.name} agents`}
              className="category-card category-card-link"
              href={`/marketplace?category=${category.category}`}
              key={category.name}
            >
              <div className={`category-signal category-signal-${index + 1}`} aria-hidden="true">
                <span />
                <i />
              </div>
              <span className="category-number">0{index + 1} / 04</span>
              <h3>{category.name}</h3>
              <p>{category.description}</p>
              <span className="category-proof">{category.proof}</span>
              <span className="evidence-state">
                Public analyzer live · BSC testnet identity verified
              </span>
              <span className="category-card-action" aria-hidden="true">
                Explore agents →
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="shell method" id="method" aria-labelledby="method-heading">
        <div className="method-title">
          <span className="eyebrow">THE PROOF LAYER</span>
          <h2 id="method-heading">Missing evidence is a result.</h2>
          <p>
            Every green state earns its color. Everything else stays explicit, inspectable, and
            bounded.
          </p>
        </div>
        <div className="method-copy">
          <p>
            A registry proves an identity exists. It does not prove the strategy works. ProofEra
            joins registry ownership with current protocol data, onchain actions, costs, outcomes,
            and scoped authority.
          </p>
          <ul>
            {proofRules.map((rule, index) => (
              <li key={rule}>
                <span aria-hidden="true">0{index + 1}</span>
                {rule}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
