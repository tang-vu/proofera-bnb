import type { Metadata } from "next";

import registrationEvidence from "../../../../evidence/submission/final/agent-registration.json";
import readiness from "../../../../evidence/submission/readiness.json";
import { publicBuildIdentifier } from "../../lib/runtime-readiness";
import {
  verifiedReferenceEvidence,
  verifiedTermixPairs
} from "../../lib/verified-submission-evidence";

import styles from "./proof.module.css";

export const metadata: Metadata = {
  title: "Proof room",
  description: "ProofEra release, agent, execution, benchmark, and submission evidence status."
};

export const dynamic = "force-dynamic";

const agents = [
  {
    key: "lp-range",
    category: "LP range",
    endpoint: "https://proofera-lp.tangvu.dev",
    skills: ["analyze_lp_range", "audit_altana_permission_bundle"]
  },
  {
    key: "grid-trading",
    category: "Grid trading",
    endpoint: "https://proofera-grid.tangvu.dev",
    skills: ["analyze_grid_trading"]
  },
  {
    key: "yield-optimisation",
    category: "Yield optimisation",
    endpoint: "https://proofera-yield.tangvu.dev",
    skills: ["analyze_yield_opportunities"]
  },
  {
    key: "health-factor",
    category: "Health factor",
    endpoint: "https://proofera-health.tangvu.dev",
    skills: ["analyze_venus_health_factor"]
  }
] as const;

function humanize(value: string): string {
  return value.replaceAll("-", " ").replaceAll("_", " ");
}

function sourceUrl(build: string, path: string): string | null {
  if (!/^[0-9a-f]{40}$/u.test(build)) return null;
  return `https://github.com/tang-vu/proofera-bnb/blob/${build}/${path}`;
}

function formatNanoseconds(value: string): string {
  const nanoseconds = BigInt(value);
  const seconds = nanoseconds / 1_000_000_000n;
  const fraction = (nanoseconds % 1_000_000_000n).toString().padStart(9, "0").replace(/0+$/u, "");
  return fraction.length === 0
    ? seconds.toString() + " s"
    : seconds.toString() + "." + fraction + " s";
}

export default function ProofRoomPage() {
  const build = publicBuildIdentifier();
  const verifiedGateCount = readiness.gates.filter((gate) => gate.state === "verified").length;

  return (
    <main id="main-content" tabIndex={-1}>
      <section className={`shell ${styles.hero}`} aria-labelledby="proof-room-heading">
        <div>
          <span className="eyebrow">JUDGE-FACING EVIDENCE INDEX</span>
          <h1 id="proof-room-heading">Proof, including what is missing.</h1>
          <p className="lede">
            This page separates public capability from onchain identity, execution receipts, and
            measured advantage. A green build cannot turn an incomplete gate into evidence.
          </p>
        </div>
        <aside className={styles.releasePanel} aria-label="Current release evidence status">
          <div className={styles.releaseSignal}>
            <div className={styles.releaseOrb} aria-hidden="true">
              <span />
              <i />
            </div>
            <div>
              <span>RELEASE LEDGER</span>
              <strong>
                {verifiedGateCount} / {readiness.gates.length} gates verified
              </strong>
              <p>Non-final states remain visible</p>
            </div>
          </div>
          <div
            aria-label={`${verifiedGateCount} of ${readiness.gates.length} release gates verified`}
            className={styles.gateMeter}
            role="img"
          >
            {readiness.gates.map((gate) => (
              <span data-state={gate.state} key={gate.gateId} />
            ))}
          </div>
          <dl className={styles.releaseFacts}>
            <div>
              <dt>Public build</dt>
              <dd>{build}</dd>
            </div>
            <div>
              <dt>Closure schema</dt>
              <dd>{readiness.schemaVersion}</dd>
            </div>
            <div>
              <dt>Submission-ready</dt>
              <dd className={readiness.readyForSubmission ? styles.verified : styles.incomplete}>
                {readiness.readyForSubmission ? "Verified" : "No — gates remain open"}
              </dd>
            </div>
          </dl>
        </aside>
      </section>

      <section className={`shell section ${styles.section}`} aria-labelledby="agents-heading">
        <div className="section-heading">
          <div>
            <span className="eyebrow">FOUR PUBLIC CAPABILITIES</span>
            <h2 id="agents-heading">Live endpoints. BSC-testnet registration verified.</h2>
          </div>
          <p>
            Each analyzer is deterministic and non-executing. Finalized ERC-8004 receipts prove
            identity publication only; they do not prove hiring, strategy performance, or
            transaction authority.
          </p>
        </div>
        <div className={styles.agentGrid}>
          {agents.map((agent) => {
            const registration = registrationEvidence.agents.find(
              (candidate) => candidate.key === agent.key
            );
            const hireEvidence = verifiedReferenceEvidence.find(
              (candidate) => candidate.agentId === registration?.agentId
            );
            return (
              <article className={styles.agentCard} key={agent.category}>
                <div className={styles.cardHeading}>
                  <h3>{agent.category}</h3>
                  <span className={styles.available}>Public</span>
                </div>
                <a href={`${agent.endpoint}/.well-known/agent-card.json`}>{agent.endpoint}</a>
                <ul aria-label={`${agent.category} skills`}>
                  {agent.skills.map((skill) => (
                    <li key={skill}>{skill}</li>
                  ))}
                </ul>
                <p>
                  BSC testnet ERC-8004 Agent ID {registration?.agentId ?? "unknown"} · Execution
                  disabled
                </p>
                <p>
                  Finalized paid hire receipts {hireEvidence?.paidHireReceipts.length ?? 0} · Task
                  completion not inferred
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <section
        className={`shell section ${styles.section}`}
        aria-labelledby="termix-results-heading"
      >
        <div className="section-heading">
          <div>
            <span className="eyebrow">AGENT ADVANTAGE REPORT</span>
            <h2 id="termix-results-heading">Three paired tasks. Mixed timing. Quality parity.</h2>
          </div>
          <p>
            Both lanes scored 100/100 with zero incremental native cost in every bounded task.
            Timing points in different directions, so ProofEra makes no universal speed, quality, or
            financial-advantage claim.
          </p>
        </div>
        <div className={styles.agentGrid}>
          {verifiedTermixPairs.map((pair) => (
            <article className={styles.agentCard} key={pair.taskId}>
              <div className={styles.cardHeading}>
                <h3>{pair.label}</h3>
                <span className={styles.available}>
                  {pair.timingWinner === "agent" ? "Agent faster" : "Manual faster"}
                </span>
              </div>
              <dl className="pancake-facts">
                <div>
                  <dt>Agent time</dt>
                  <dd>{formatNanoseconds(pair.agentNanoseconds)}</dd>
                </div>
                <div>
                  <dt>Manual time</dt>
                  <dd>{formatNanoseconds(pair.manualNanoseconds)}</dd>
                </div>
                <div>
                  <dt>Quality</dt>
                  <dd>
                    {pair.agentQualityPoints}/{pair.maximumQualityPoints} agent ·{" "}
                    {pair.manualQualityPoints}/{pair.maximumQualityPoints} manual
                  </dd>
                </div>
                <div>
                  <dt>Incremental native cost</dt>
                  <dd>
                    {pair.agentCostMinorUnits} {pair.costSymbol} agent · {pair.manualCostMinorUnits}{" "}
                    {pair.costSymbol} manual
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
        <p className="registry-footnote">
          The review is owner-designated internal, not external or cryptographically authenticated.
          Raw outputs, paired report, and adjudication remain digest-bound in the closure ledger
          below.
        </p>
      </section>

      <section className={`shell section ${styles.section}`} aria-labelledby="closure-heading">
        <div className="section-heading">
          <div>
            <span className="eyebrow">SUBMISSION CLOSURE CONTRACT</span>
            <h2 id="closure-heading">Seven gates. No inferred receipts.</h2>
          </div>
          <p>
            The committed manifest digest-binds every listed artifact. Final mode additionally
            requires complete evidence kinds, final-only paths, a clean worktree, and a published
            commit.
          </p>
        </div>
        <ol className={styles.gateList}>
          {readiness.gates.map((gate, index) => (
            <li
              className={styles.gate}
              data-gate-id={gate.gateId}
              data-gate-state={gate.state}
              key={gate.gateId}
            >
              <div className={styles.gateNumber}>{String(index + 1).padStart(2, "0")}</div>
              <div className={styles.gateBody}>
                <div className={styles.cardHeading}>
                  <h3>{humanize(gate.gateId)}</h3>
                  <span className={gate.state === "verified" ? styles.verified : styles.incomplete}>
                    {humanize(gate.state)}
                  </span>
                </div>
                <p>{gate.claim}</p>
                {gate.blockers.length > 0 ? (
                  <div className={styles.blocker}>
                    <strong>Required next evidence</strong>
                    <ul>
                      {gate.blockers.map((blocker) => (
                        <li key={blocker}>{blocker}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {gate.artifacts.length > 0 ? (
                  <details>
                    <summary>{gate.artifacts.length} digest-bound current artifact(s)</summary>
                    <ul className={styles.artifacts}>
                      {gate.artifacts.map((artifact) => {
                        const url = sourceUrl(build, artifact.path);
                        return (
                          <li key={`${artifact.kind}:${artifact.path}`}>
                            <span>{humanize(artifact.kind)}</span>
                            {url === null ? (
                              <code>{artifact.path}</code>
                            ) : (
                              <a href={url}>{artifact.path}</a>
                            )}
                            <code>sha256:{artifact.sha256}</code>
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
