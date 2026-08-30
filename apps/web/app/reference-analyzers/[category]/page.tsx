import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  referenceAnalyzerCategories,
  referenceAnalyzerPassportForCategory,
  type ReferenceAnalyzerCategory,
  type ReferenceAnalyzerPassport
} from "../../../lib/reference-analyzer-passport";
import { verifiedReferenceEvidenceForCategory } from "../../../lib/verified-submission-evidence";
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
          " analyzer with a finalized BSC-testnet ERC-8004 identity. Execution and performance remain unverified."
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
  const verifiedEvidence = verifiedReferenceEvidenceForCategory(passport.category);

  const identityFacts = [
    {
      label: "Network and chain ID",
      value: "BSC testnet · chain 97",
      state: "observed"
    },
    {
      label: "ERC-8004 identity",
      value: "Agent ID " + passport.identity.erc8004TokenId,
      state: "observed"
    },
    {
      label: "Registered owner",
      value: passport.identity.ownerAddress,
      state: "observed"
    },
    {
      label: "Registration receipt",
      value: passport.identity.registrationTransactionHash,
      href: "https://testnet.bscscan.com/tx/" + passport.identity.registrationTransactionHash,
      state: "observed"
    },
    {
      label: "Last agent activity",
      value: "Not observed — registration and hire receipts are not execution telemetry.",
      state: "unknown"
    },
    {
      label: "Execution count and success rate",
      value: "Not measured — no decoded strategy-execution set exists.",
      state: "unknown"
    },
    {
      label: "Fees, uptime, risk, and reputation",
      value: "Not scored — identity and paid hire events are insufficient.",
      state: "unknown"
    },
    {
      label: "Latest execution receipt",
      value: "None — paid hire receipts do not prove task completion.",
      state: "unknown"
    }
  ] as const;

  return (
    <main id="main-content" tabIndex={-1}>
      <header className={["shell", styles.hero].join(" ")}>
        <div>
          <span className="eyebrow">REGISTERED REFERENCE AGENT DOSSIER</span>
          <p className="mono-kicker">{passport.coverage.skill}</p>
          <h1>{passport.coverage.name}</h1>
          <p className="lede">
            This deterministic public analyzer covers{" "}
            {categoryLabels[passport.category].toLowerCase()} and has finalized ERC-8004 Agent ID{" "}
            {passport.identity.erc8004TokenId} on BSC testnet. Registration is not a recommendation,
            execution receipt, or performance record.
          </p>
        </div>
        <aside className={styles.boundary} aria-labelledby="boundary-heading">
          <span className="state-badge state-available">Identity verified</span>
          <h2 id="boundary-heading">Identity exists. Execution gates remain closed.</h2>
          <p>{passport.coverage.boundary}</p>
          <p>
            This route performs no wallet or write call. Finalized identity and paid hire receipts
            stay separate from current hireability, execution authority, task completion, and
            strategy outcome.
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
            <h2 id="eligibility-heading">Identity verified. Execution gates closed.</h2>
          </div>
          <p>
            Identity and registration are true from finalized BSC-testnet evidence. Marketplace,
            activation, execution, and current hireability remain false because those require
            separate evidence and product controls.
          </p>
        </div>
        <dl className={styles.eligibilityGrid}>
          {(Object.keys(eligibilityLabels) as Array<keyof typeof eligibilityLabels>).map((key) => (
            <div key={key}>
              <dt>{eligibilityLabels[key]}</dt>
              <dd>
                <span
                  className={
                    passport.eligibility[key]
                      ? "state-badge state-available"
                      : "state-badge state-caution"
                  }
                >
                  {passport.eligibility[key] ? "True" : "False"}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={["shell", styles.section].join(" ")} aria-labelledby="identity-heading">
        <div className={styles.sectionHeading}>
          <div>
            <span className="eyebrow">02 · IDENTITY AND TRACK RECORD</span>
            <h2 id="identity-heading">Finalized identity, bounded claims.</h2>
          </div>
          <p>
            Registration and paid hire events are displayed from committed finalized evidence.
            Unobserved execution, outcome, uptime, reputation, and performance remain unknown.
          </p>
        </div>
        <dl className={styles.identityGrid}>
          {identityFacts.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>
                {fact.state === "observed" ? (
                  <span>
                    <span className="state-badge state-available">Verified</span>{" "}
                    {"href" in fact ? (
                      <a href={fact.href} rel="noopener noreferrer" target="_blank">
                        {fact.value} <span aria-hidden="true">↗</span>
                      </a>
                    ) : (
                      <span className="raw-value">{fact.value}</span>
                    )}
                  </span>
                ) : (
                  <UnknownValue>{fact.value}</UnknownValue>
                )}
              </dd>
            </div>
          ))}
        </dl>
        <div className={styles.methodBoundary}>
          <div>
            <span className="panel-overline">FINALIZED PAID HIRE RECEIPTS</span>
            <strong>{verifiedEvidence.paidHireReceipts.length}</strong>
          </div>
          {verifiedEvidence.paidHireReceipts.length === 0 ? (
            <p>No paid hire receipt is present for this identity in the current final artifact.</p>
          ) : (
            <ul>
              {verifiedEvidence.paidHireReceipts.map((receipt) => (
                <li key={receipt.transactionHash}>
                  <a href={receipt.explorerUrl} rel="noopener noreferrer" target="_blank">
                    {receipt.slug} <span aria-hidden="true">↗</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          <p>
            A paid hire receipt proves a finalized testnet engagement event only. It does not prove
            that the task completed or that the agent produced a beneficial outcome.
          </p>
        </div>
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
            <h2 id="provenance-heading">Inspectable code and finalized identity evidence.</h2>
          </div>
          <p>
            Paths below bind the method contract and finalized registration evidence. They do not
            turn missing execution or performance observations into current facts.
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
          <span className="eyebrow">LIVE PRODUCT BOUNDARY</span>
          <h2 id="execution-boundary-heading">
            Analysis is live. Strategy execution stays disabled.
          </h2>
          <p id="execution-disabled-reason">
            Run this exact public analyzer in the testnet studio with a bounded input. The result is
            read-only decision support: it creates no wallet authority, strategy transaction,
            completion receipt, or performance claim.
          </p>
        </div>
        <div className="hero-actions">
          <Link
            className="button button-primary button-arrow"
            href={`/studio?agent=${passport.category}`}
          >
            Run live analyzer
          </Link>
          <Link className="button button-secondary" href={configurationRoutes[passport.category]}>
            Configure mandate
          </Link>
          <Link className="button button-secondary" href="/session-control">
            Inspect session controls
          </Link>
        </div>
      </section>
    </main>
  );
}
