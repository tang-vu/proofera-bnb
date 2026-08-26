import Link from "next/link";

const categories = [
  {
    name: "LP rebalancing",
    description: "Keep concentrated liquidity productive inside bounded ranges.",
    category: "lp-rebalancing"
  },
  {
    name: "Grid trading",
    description: "Run a price grid with visible drawdown, turnover, fills, and costs.",
    category: "grid-trading"
  },
  {
    name: "Yield optimisation",
    description: "Compare sustainable net yield, liquidity, exposure, and exit constraints.",
    category: "yield-optimisation"
  },
  {
    name: "Health monitoring",
    description: "Watch lending risk and intervene under an explicit liquidation policy.",
    category: "health-factor-monitoring"
  }
] as const;

export default function HomePage() {
  return (
    <main id="main-content" tabIndex={-1}>
      <nav className="shell nav" aria-label="Primary navigation">
        <Link className="wordmark" href="/" aria-label="ProofEra home">
          <span aria-hidden="true" className="mark">
            P
          </span>
          ProofEra
        </Link>
        <div className="nav-links">
          <Link href="/marketplace">Marketplace</Link>
          <Link href="/proof">Proof room</Link>
          <Link className="nav-optional" href="/session-control">
            Session control
          </Link>
          <Link className="nav-optional" href="/mission-control">
            Mission Control
          </Link>
          <a className="nav-optional" href="#method">
            How proof works
          </a>
          <span className="network-pill">BSC testnet first</span>
        </div>
      </nav>

      <section className="shell hero">
        <div className="eyebrow">AUTONOMOUS DEFI, WITH AN OFF SWITCH</div>
        <h1>
          Hire agents by proof,
          <br />
          not promises.
        </h1>
        <p className="lede">
          Start with what your capital needs. ProofEra is building a gate across identity, evidence,
          downside, permissions, and freshness before an agent gets authority.
        </p>
        <div className="hero-actions">
          <Link className="button button-primary" href="/marketplace">
            Find an agent
          </Link>
          <Link className="button button-secondary" href="/mission-control">
            See active mandates
          </Link>
          <Link className="button button-secondary" href="/session-control">
            Grant a testnet session
          </Link>
          <a className="button button-secondary" href="#method">
            How proof works
          </a>
        </div>
        <dl className="trust-strip" aria-label="ProofEra product rules">
          <div>
            <dt>Metric rule</dt>
            <dd>Source + timestamp</dd>
          </div>
          <div>
            <dt>Permission rule</dt>
            <dd>Grant once + bounded</dd>
          </div>
          <div>
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
              <span className="category-number">0{index + 1}</span>
              <h3>{category.name}</h3>
              <p>{category.description}</p>
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
        <div>
          <span className="eyebrow">THE PROOF LAYER</span>
          <h2 id="method-heading">Missing evidence is a result.</h2>
        </div>
        <div className="method-copy">
          <p>
            A registry proves an identity exists. It does not prove the strategy works. ProofEra
            joins registry ownership with current protocol data, onchain actions, costs, outcomes,
            and scoped authority.
          </p>
          <ul>
            <li>Unknown fields remain unknown and lower confidence.</li>
            <li>Stale sources are visibly stale, never silently refreshed with fixtures.</li>
            <li>Simulations and realized performance are separated.</li>
            <li>One scoped grant covers valid actions; scope expansion requires the owner.</li>
            <li>Pause and revocation are part of activation, not a support article.</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
