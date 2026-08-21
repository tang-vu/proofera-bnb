import type { Metadata } from "next";
import Link from "next/link";

import registrationEvidence from "../../../../evidence/submission/final/agent-registration.json";
import readiness from "../../../../evidence/submission/readiness.json";
import { publicBuildIdentifier } from "../../lib/runtime-readiness";

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

export default function ProofRoomPage() {
  const build = publicBuildIdentifier();

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
          <span className="nav-current">Proof room</span>
          <Link className="nav-optional" href="/mission-control">
            Mission Control
          </Link>
          <span className="network-pill">BSC testnet first</span>
        </div>
      </nav>

      <section className={`shell ${styles.hero}`} aria-labelledby="proof-room-heading">
        <div>
          <span className="eyebrow">JUDGE-FACING EVIDENCE INDEX</span>
          <h1 id="proof-room-heading">Proof, including what is missing.</h1>
          <p className="lede">
            This page separates public capability from onchain identity, execution receipts, and
            measured advantage. A green build cannot turn an incomplete gate into evidence.
          </p>
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
              </article>
            );
          })}
        </div>
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
