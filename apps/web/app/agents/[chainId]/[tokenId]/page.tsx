import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { LiveEvidenceLoading } from "../../../live-evidence-loading";
import { parseAgentRouteIdentity, type AgentRouteIdentity } from "../../../../lib/agent-route";
import { loadRegistryAgent } from "../../../../lib/registry";

export const metadata: Metadata = {
  title: "Agent Passport"
};

export const dynamic = "force-dynamic";

interface AgentPassportPageProps {
  readonly params: Promise<{ chainId: string; tokenId: string }>;
}

const identityRegistries = {
  56: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
  97: "0x8004A818BFB912233c491871b3d84c89A494BD9e"
} as const;

function cleanText(value: string | null | undefined, fallback: string, maximum: number): string {
  if (value === null || value === undefined) return fallback;
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length === 0) return fallback;
  return cleaned.length > maximum ? `${cleaned.slice(0, maximum - 1)}…` : cleaned;
}

function shortenedAddress(value: string | null | undefined): string {
  if (value === null || value === undefined || value.length < 12) return "Unknown";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function UnknownEvidence({ label, reason }: Readonly<{ label: string; reason: string }>) {
  return (
    <div className="unknown-evidence-row">
      <dt>{label}</dt>
      <dd>
        <span className="state-badge state-unknown">Unknown</span>
        <span>{reason}</span>
      </dd>
    </div>
  );
}

function PassportUnavailable({
  observedAt,
  reason,
  message
}: Readonly<{ observedAt: string; reason: string; message: string }>) {
  return (
    <div className="unavailable-panel passport-unavailable" role="alert">
      <div>
        <span className="state-badge state-caution">Source unavailable</span>
        <h2>Identity evidence could not be refreshed.</h2>
        <p>{message}</p>
      </div>
      <dl>
        <div>
          <dt>Attempted</dt>
          <dd>{new Date(observedAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC</dd>
        </div>
        <div>
          <dt>Failure class</dt>
          <dd>{reason.replaceAll("_", " ")}</dd>
        </div>
        <div>
          <dt>Fallback</dt>
          <dd>None — no fixture or stale identity substituted</dd>
        </div>
      </dl>
    </div>
  );
}

export default async function AgentPassportPage({ params }: AgentPassportPageProps) {
  const identity = parseAgentRouteIdentity(await params);
  if (identity === null) notFound();

  return (
    <Suspense
      fallback={
        <LiveEvidenceLoading
          detail="Checking the requested BSC identity before presenting any registry claim or activation decision."
          title="Loading Agent Passport."
        />
      }
    >
      <ResolvedAgentPassport identity={identity} />
    </Suspense>
  );
}

async function ResolvedAgentPassport({ identity }: Readonly<{ identity: AgentRouteIdentity }>) {
  const result = await loadRegistryAgent(identity.chainId, identity.tokenId);
  if (result.status === "not_found") notFound();

  const network = identity.chainId === 56 ? "BSC mainnet" : "BSC testnet";
  const explorerOrigin =
    identity.chainId === 56 ? "https://bscscan.com" : "https://testnet.bscscan.com";
  const registryAddress = identityRegistries[identity.chainId];

  return (
    <main id="main-content" tabIndex={-1}>
      <header className="shell passport-header">
        <div>
          <span className="eyebrow">SOURCE-LINKED AGENT PASSPORT</span>
          <p className="mono-kicker">
            ERC-8004 · chain {identity.chainId} · token #{identity.tokenId}
          </p>
        </div>
        <div className="agent-card-topline">
          <span className="state-badge state-live">Identity lookup</span>
          <span className="state-badge state-caution">Capability unverified</span>
          <span className="state-badge state-caution">Activation locked</span>
        </div>
      </header>

      {result.status === "unavailable" ? (
        <section className="shell passport-section">
          <PassportUnavailable
            message={result.message}
            observedAt={result.observedAt}
            reason={result.reason}
          />
          <Link className="button button-secondary passport-back" href="/marketplace">
            Return to marketplace
          </Link>
        </section>
      ) : (
        <>
          <section className="shell passport-intro" aria-labelledby="passport-name">
            <div>
              <p className="panel-overline">REGISTRY CLAIM</p>
              <h1 id="passport-name">
                {cleanText(result.agent.name, `Agent #${identity.tokenId}`, 120)}
              </h1>
              <p className="lede">
                {cleanText(
                  result.agent.description,
                  "No description was supplied in the indexed registration metadata.",
                  700
                )}
              </p>
            </div>
            <aside className="passport-verdict">
              <span className="panel-overline">PROOFERA DECISION</span>
              <strong>Do not activate yet.</strong>
              <p>
                This lookup proves an indexed identity record, not a working financial strategy,
                safe permissions, or realized performance.
              </p>
            </aside>
          </section>

          <section className="shell passport-grid" aria-label="Agent evidence">
            <article className="passport-panel">
              <div className="passport-panel-heading">
                <div>
                  <span className="step-number">01</span>
                  <h2>Identity evidence</h2>
                </div>
                <span className="state-badge state-live">Observed</span>
              </div>
              <dl className="passport-facts">
                <div>
                  <dt>Network</dt>
                  <dd>{network}</dd>
                </div>
                <div>
                  <dt>Registry token</dt>
                  <dd>#{identity.tokenId}</dd>
                </div>
                <div>
                  <dt>Owner</dt>
                  <dd title={result.agent.owner_address ?? undefined}>
                    {shortenedAddress(result.agent.owner_address)}
                  </dd>
                </div>
                <div>
                  <dt>Indexed registration time</dt>
                  <dd>
                    {result.agent.created_at === null || result.agent.created_at === undefined
                      ? "Unknown"
                      : new Date(result.agent.created_at).toLocaleString("en-GB", {
                          timeZone: "UTC"
                        }) + " UTC"}
                  </dd>
                </div>
                <div>
                  <dt>Self-declared protocols</dt>
                  <dd>
                    {result.agent.supported_protocols === null ||
                    result.agent.supported_protocols === undefined ||
                    result.agent.supported_protocols.length === 0
                      ? "Not supplied"
                      : cleanText(result.agent.supported_protocols.join(", "), "Not supplied", 300)}
                  </dd>
                </div>
                <div>
                  <dt>Source observed</dt>
                  <dd>
                    {new Date(result.observedAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC
                  </dd>
                </div>
              </dl>
              <div className="passport-source-links">
                <a className="text-link" href={result.sourceUrl} rel="noreferrer" target="_blank">
                  Open indexed API source <span aria-hidden="true">↗</span>
                </a>
                <a
                  className="text-link"
                  href={`${explorerOrigin}/address/${registryAddress}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open identity registry <span aria-hidden="true">↗</span>
                </a>
              </div>
            </article>

            <article className="passport-panel">
              <div className="passport-panel-heading">
                <div>
                  <span className="step-number">02</span>
                  <h2>Evidence gaps</h2>
                </div>
                <span className="state-badge state-unknown">Incomplete</span>
              </div>
              <dl className="unknown-evidence-list">
                <UnknownEvidence
                  label="Category fitness"
                  reason="No independent strategy classification has been attached."
                />
                <UnknownEvidence
                  label="Endpoint and uptime"
                  reason="No safe endpoint probe or observation window has been verified."
                />
                <UnknownEvidence
                  label="Executions and success rate"
                  reason="No independently decoded BSC execution history is attached."
                />
                <UnknownEvidence
                  label="Returns and downside"
                  reason="No category-specific realized outcome series or cost methodology is attached."
                />
                <UnknownEvidence
                  label="Fees and permissions"
                  reason="No reviewed fee schedule, call scope, spend cap, expiry, or revoke proof is attached."
                />
                <UnknownEvidence
                  label="Proof Score"
                  reason="Insufficient evidence; the upstream registry score is never substituted."
                />
              </dl>
            </article>
          </section>

          <section className="shell upstream-score-note">
            <div>
              <span className="panel-overline">UPSTREAM CONTEXT — NOT PROOFERA SCORE</span>
              <strong>
                8004scan score: {result.agent.total_score ?? "Unknown"} · feedback sample:{" "}
                {result.agent.total_feedbacks ?? "Unknown"}
              </strong>
            </div>
            <p>
              ProofEra does not copy this value into Proof Score or use it to unlock activation.
              Reviewer identity, sample quality, live behavior, risk and category outcomes still
              require separate evidence.
            </p>
          </section>
        </>
      )}
    </main>
  );
}
