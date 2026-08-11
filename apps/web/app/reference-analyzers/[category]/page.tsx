import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  referenceAnalyzerCategories,
  referenceAnalyzerPassportForCategory,
  type ReferenceAnalyzerCategory,
  type ReferenceAnalyzerPassport
} from "../../../lib/reference-analyzer-passport";
import styles from "./reference-analyzer.module.css";

export const dynamic = "force-static";
export const dynamicParams = false;

interface ReferenceAnalyzerPageProps {
  readonly params: Promise<{ category: string }>;
}

const categoryLabels: Readonly<Record<ReferenceAnalyzerCategory, string>> = Object.freeze({
  "lp-rebalancing": "LP rebalancing",
  "grid-trading": "Grid trading",
  "yield-optimisation": "Yield optimisation",
  "health-factor-monitoring": "Health-factor monitoring"
});

const configurationRoutes: Readonly<Record<ReferenceAnalyzerCategory, string>> = Object.freeze({
  "lp-rebalancing": "/lp-activate",
  "grid-trading": "/configure/grid-trading",
  "yield-optimisation": "/configure/yield-optimisation",
  "health-factor-monitoring": "/configure/health-factor-monitoring"
});

const eligibilityLabels: Readonly<Record<keyof ReferenceAnalyzerPassport["eligibility"], string>> =
  Object.freeze({
    liveBscAgent: "Live BSC agent",
    erc8004Registered: "ERC-8004 registered",
    marketplaceEligible: "Marketplace eligible",
    activationEligible: "Activation eligible",
    executionEnabled: "Execution enabled",
    hireable: "Hireable"
  });

export function generateStaticParams(): Array<{ category: ReferenceAnalyzerCategory }> {
  return referenceAnalyzerCategories.map((category) => ({ category }));
}

export async function generateMetadata({ params }: ReferenceAnalyzerPageProps): Promise<Metadata> {
  const passport = referenceAnalyzerPassportForCategory((await params).category);
  return {
    title:
      passport === null
        ? "Reference analyzer not found"
        : passport.coverage.name + " reference dossier",
    description:
      passport === null
        ? "The requested ProofEra reference analyzer category does not exist."
        : "Repository-backed " +
          categoryLabels[passport.category] +
          " analyzer contract. Not a live, registered, hireable, or executable BSC agent."
  };
}

function UnknownValue({ children }: Readonly<{ children: string }>) {
  return (
    <span className={styles.unknownValue}>
      <span className="state-badge state-unknown">Unknown</span>
      <span>{children}</span>
    </span>
  );
}

export default async function ReferenceAnalyzerPage({ params }: ReferenceAnalyzerPageProps) {
  const passport = referenceAnalyzerPassportForCategory((await params).category);
  if (passport === null) notFound();

  const identityFacts = [
    ["Network and chain ID", "Not assigned — no deployment is represented."],
    ["ERC-8004 identity", "Absent — no token ID or registry transaction exists."],
    ["Owner", "Absent — repository authorship is not an onchain owner address."],
    ["Last activity", "Not observed — this page performs no endpoint or chain read."],
    ["Execution count and success rate", "Not measured — no decoded execution set exists."],
    ["Fees and uptime", "Not published — there is no live service observation window."],
    ["Risk and reputation", "Not scored — local code is not sufficient market evidence."],
    ["Latest transaction receipt", "None — no transaction is created or claimed here."]
  ] as const;

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
          <span className="nav-current">Reference dossier</span>
          <span className="network-pill">Local code only</span>
        </div>
      </nav>

      <header className={["shell", styles.hero].join(" ")}>
        <div>
          <span className="eyebrow">REFERENCE ANALYZER DOSSIER · NOT AN AGENT PASSPORT</span>
          <p className="mono-kicker">{passport.coverage.skill}</p>
          <h1>{passport.coverage.name}</h1>
          <p className="lede">
            This is a repository-backed, deterministic analysis contract for{" "}
            {categoryLabels[passport.category].toLowerCase()}. It is not a live BSC agent, an
            ERC-8004 identity, a recommendation, or a performance record.
          </p>
        </div>
        <aside className={styles.boundary} aria-labelledby="boundary-heading">
          <span className="state-badge state-caution">Do not hire or activate</span>
          <h2 id="boundary-heading">Code exists. Agent evidence does not.</h2>
          <p>{passport.coverage.boundary}</p>
          <p>
            This route makes no network, wallet, environment, or write call. A methodology version
            describes local code; it does not prove an execution or outcome.
          </p>
        </aside>
      </header>

      <nav
        className={["shell", styles.categoryNav].join(" ")}
        aria-label="Reference analyzer categories"
      >
        {referenceAnalyzerCategories.map((category) =>
          category === passport.category ? (
            <span aria-current="page" className={styles.currentCategory} key={category}>
              {categoryLabels[category]}
            </span>
          ) : (
            <Link href={"/reference-analyzers/" + category} key={category}>
              {categoryLabels[category]}
            </Link>
          )
        )}
      </nav>

      <section
        className={["shell", styles.section].join(" ")}
        aria-labelledby="eligibility-heading"
      >
        <div className={styles.sectionHeading}>
          <div>
            <span className="eyebrow">01 · ELIGIBILITY BOUNDARY</span>
            <h2 id="eligibility-heading">Every execution gate is closed.</h2>
          </div>
          <p>
            Five execution flags come from the shared four-category reference coverage record.
            Hireable is separately held false because this analyzer is neither marketplace-eligible
            nor activation-eligible. None are inferred from source code or deterministic tests.
          </p>
        </div>
        <dl className={styles.eligibilityGrid}>
          {(Object.keys(eligibilityLabels) as Array<keyof typeof eligibilityLabels>).map((key) => (
            <div key={key}>
              <dt>{eligibilityLabels[key]}</dt>
              <dd>
                <span className="state-badge state-caution">False</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={["shell", styles.section].join(" ")} aria-labelledby="identity-heading">
        <div className={styles.sectionHeading}>
          <div>
            <span className="eyebrow">02 · IDENTITY AND TRACK RECORD</span>
            <h2 id="identity-heading">Absence stays visible.</h2>
          </div>
          <p>
            No local fixture, filename, or test result is substituted for a registration, owner,
            activity observation, reputation sample, or transaction receipt.
          </p>
        </div>
        <dl className={styles.identityGrid}>
          {identityFacts.map(([label, explanation]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>
                <UnknownValue>{explanation}</UnknownValue>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={["shell", styles.section].join(" ")} aria-labelledby="metrics-heading">
        <div className={styles.sectionHeading}>
          <div>
            <span className="eyebrow">03 · CATEGORY EVIDENCE CONTRACT</span>
            <h2 id="metrics-heading">Eight required fields. Eight honest unknowns.</h2>
          </div>
          <p>
            Each field defines what a future live agent must prove. Source, observation time, value,
            and receipt remain absent until independently joined evidence exists.
          </p>
        </div>
        <div className={styles.metricGrid}>
          {passport.metrics.map((metric, index) => (
            <article
              aria-labelledby={"metric-" + metric.id}
              className={styles.metricCard}
              key={metric.id}
            >
              <div className={styles.metricTopline}>
                <span className={styles.metricNumber}>{String(index + 1).padStart(2, "0")}</span>
                <span className="state-badge state-unknown">Unknown · no observation</span>
              </div>
              <h3 id={"metric-" + metric.id}>{metric.label}</h3>
              <p className={styles.decisionUse}>{metric.decisionUse}</p>
              <dl className={styles.metricFacts}>
                <div>
                  <dt>Value</dt>
                  <dd>Unknown</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>None attached</dd>
                </div>
                <div>
                  <dt>Observed at</dt>
                  <dd>Not observed</dd>
                </div>
                <div>
                  <dt>Receipt</dt>
                  <dd>No receipt</dd>
                </div>
                <div>
                  <dt>Methodology</dt>
                  <dd>{metric.methodologyVersion ?? "No metric calculator"}</dd>
                </div>
                <div>
                  <dt>Method state</dt>
                  <dd>
                    {metric.methodologyState === "implemented_not_run"
                      ? "Implemented; not run"
                      : "Definition documented; calculator absent"}
                  </dd>
                </div>
              </dl>
              <div className={styles.evidenceNeed}>
                <strong>Evidence required</strong>
                <p>{metric.expectedEvidence}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={["shell", styles.section].join(" ")} aria-labelledby="provenance-heading">
        <div className={styles.sectionHeading}>
          <div>
            <span className="eyebrow">04 · REPOSITORY PROVENANCE</span>
            <h2 id="provenance-heading">Inspectable code paths, not live proof.</h2>
          </div>
          <p>
            Paths below are plain repository references. They are deliberately not converted into
            arbitrary external links and do not imply that a service is deployed.
          </p>
        </div>
        <div className={styles.provenanceGrid}>
          {passport.provenance.map((source) => (
            <div key={source.path}>
              <span>{source.label}</span>
              <code>{source.path}</code>
            </div>
          ))}
        </div>
        <div className={styles.methodBoundary}>
          <div>
            <span className="panel-overline">DECLARED LOCAL METHOD</span>
            <strong>{passport.coverage.methodologyVersion}</strong>
          </div>
          <p>
            The version identifies deterministic repository logic. Its outputs require
            caller-supplied inputs and are not displayed here as current market data or realized
            performance.
          </p>
          {passport.relatedRoute === null ? null : (
            <Link className="text-link" href={passport.relatedRoute.href}>
              {passport.relatedRoute.label} <span aria-hidden="true">→</span>
            </Link>
          )}
        </div>
      </section>

      <section
        className={["shell", styles.activationBoundary].join(" ")}
        aria-labelledby="execution-boundary-heading"
      >
        <div>
          <span className="eyebrow">EXECUTION BOUNDARY</span>
          <h2 id="execution-boundary-heading">Analysis contract only.</h2>
          <p id="execution-disabled-reason">
            There is no connected wallet, scoped authority, BSC deployment, verified identity,
            execution receipt, or revoke target. ProofEra cannot hire or activate this analyzer.
          </p>
        </div>
        <div className="hero-actions">
          <Link className="button button-secondary" href={configurationRoutes[passport.category]}>
            Configure mandate
          </Link>
          <button
            aria-describedby="execution-disabled-reason"
            className="button"
            disabled
            type="button"
          >
            Execution unavailable
          </button>
        </div>
      </section>
    </main>
  );
}
