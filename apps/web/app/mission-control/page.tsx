import type { Metadata } from "next";
import Link from "next/link";

import { verifiedAltanaLifecycle } from "../../lib/verified-submission-evidence";

export const metadata: Metadata = { title: "Mission Control" };

const explorerOrigin = "https://testnet.bscscan.com";

function TransactionLink({ hash, label }: Readonly<{ hash: string; label: string }>) {
  return (
    <a href={explorerOrigin + "/tx/" + hash} rel="noopener noreferrer" target="_blank">
      {label} <span aria-hidden="true">↗</span>
    </a>
  );
}

export default function MissionControlPage() {
  const lifecycle = verifiedAltanaLifecycle;
  const expiresAt = new Date(lifecycle.expiresAtUnixSeconds * 1_000).toISOString();

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
          <Link className="nav-optional" href="/session-control">
            Session control
          </Link>
          <Link className="nav-optional" href="/lp-activate">
            LP mandate
          </Link>
          <span className="nav-current">Mission Control</span>
          <span className="network-pill">No active authority</span>
        </div>
      </nav>

      <header className="shell marketplace-hero">
        <span className="eyebrow">ONE GRANT / CONTINUOUS VISIBILITY / IMMEDIATE EXIT</span>
        <h1>Control the mandate, not every action.</h1>
        <p className="lede">
          A session is granted once with exact calls, spend caps, execution limits, and expiry.
          Within those limits the worker can act without another signature. Mission Control keeps
          active authority, receipts, pause, expiry, and revoke truth visible from observed state.
        </p>
      </header>

      <section className="shell pancake-result" aria-labelledby="mission-empty-heading">
        <div className="empty-panel" role="status">
          <span className="state-badge state-available">Final authority absent</span>
          <h2 id="mission-empty-heading">No active agent session exists.</h2>
          <p>
            Two fixed BSC-testnet providers observed the last verified session absent after its
            revoke receipt. No current allocation, transaction, Proof Stream receipt, or active
            permission is inferred from that historical lifecycle.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/session-control">
              Open session control
            </Link>
            <Link className="button button-secondary" href="/lp-activate">
              Configure LP mandate
            </Link>
            <Link className="button button-secondary" href="/marketplace">
              Return to marketplace
            </Link>
          </div>
        </div>

        <div className="pancake-evidence-grid">
          <article className="passport-panel">
            <div className="passport-panel-heading">
              <div>
                <span className="step-number">01</span>
                <h2>Last verified mandate</h2>
              </div>
              <span className="state-badge state-available">Revoked</span>
            </div>
            <dl className="pancake-facts">
              <div>
                <dt>Network</dt>
                <dd>BSC testnet · chain {lifecycle.chainId}</dd>
              </div>
              <div>
                <dt>Wallet</dt>
                <dd className="raw-value">{lifecycle.walletAddress}</dd>
              </div>
              <div>
                <dt>Session</dt>
                <dd className="raw-value">{lifecycle.sessionKeyAddress}</dd>
              </div>
              <div>
                <dt>Allowed call</dt>
                <dd>
                  {lifecycle.allowedCall.signature} on{" "}
                  <span className="raw-value">{lifecycle.allowedCall.target}</span>
                </dd>
              </div>
              <div>
                <dt>Native spend cap</dt>
                <dd>
                  {lifecycle.nativeSpendCap.limitWei} wei / {lifecycle.nativeSpendCap.period}
                </dd>
              </div>
              <div>
                <dt>Expiry</dt>
                <dd>{expiresAt}</dd>
              </div>
            </dl>
          </article>

          <article className="passport-panel">
            <div className="passport-panel-heading">
              <div>
                <span className="step-number">02</span>
                <h2>Receipt chain</h2>
              </div>
              <span className="state-badge state-available">3 receipts</span>
            </div>
            <ul>
              <li>
                <TransactionLink hash={lifecycle.grantTransactionHash} label="Grant receipt" />
              </li>
              <li>
                <TransactionLink hash={lifecycle.executeTransactionHash} label="Execute receipt" />
              </li>
              <li>
                <TransactionLink hash={lifecycle.revokeTransactionHash} label="Revoke receipt" />
              </li>
            </ul>
            <p>
              Final revoke truth is stronger than a button click: both fixed providers observed
              authority absent after the receipt. Historical authority was available from one
              provider only because the other provider had pruned the old state trie.
            </p>
          </article>

          <article className="passport-panel">
            <div className="passport-panel-heading">
              <div>
                <span className="step-number">03</span>
                <h2>Autonomy boundary</h2>
              </div>
              <span className="state-badge state-unknown">Fail closed</span>
            </div>
            <ul>
              <li>Inside scope: execute without a new owner signature.</li>
              <li>
                Scope, cap, chain, expiry, or revoked authority changes: require a fresh grant.
              </li>
              <li>
                Stale evidence, failed simulation, or duplicate intent: block without prompting.
              </li>
              <li>Unknown grant, execute, or revoke outcome: reconcile; never retry blindly.</li>
            </ul>
          </article>

          <article className="passport-panel">
            <div className="passport-panel-heading">
              <div>
                <span className="step-number">04</span>
                <h2>Observed application effect</h2>
              </div>
              <span className="state-badge state-caution">Zero-value fixture</span>
            </div>
            <p>
              The execute receipt contains {lifecycle.taskEffect}. This verifies the session-key
              lifecycle and exact application call semantics, but it does not prove nonzero token
              movement, LP activity, strategy performance, or economic benefit.
            </p>
          </article>
        </div>

        <footer className="registry-footnote">
          <strong>Source boundary:</strong> committed final lifecycle evidence only. This page is
          read-only and exposes no signing, retry, broadcast, or secret material.
        </footer>
      </section>
    </main>
  );
}
