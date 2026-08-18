import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Mission Control" };

export default function MissionControlPage() {
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
          <Link className="nav-optional" href="/operator-ceremony">
            Operator ceremony
          </Link>
          <Link className="nav-optional" href="/lp-activate">
            LP configuration
          </Link>
          <span className="nav-current">Mission Control</span>
          <span className="network-pill">No authority</span>
        </div>
      </nav>

      <header className="shell marketplace-hero">
        <span className="eyebrow">OBSERVE AUTHORITY, NOT UI INTENT</span>
        <h1>Mission Control begins with verified state.</h1>
        <p className="lede">
          Active agents, allocations, calls, receipts, alerts, session scope, and revoke status will
          appear only after their owning source has been observed. This deployment has no verified
          session to display.
        </p>
      </header>

      <section className="shell pancake-result" aria-labelledby="mission-empty-heading">
        <div className="empty-panel" role="status">
          <span className="state-badge state-unknown">No verified authority</span>
          <h2 id="mission-empty-heading">No active agent session exists.</h2>
          <p>
            No active allocation, transaction, Proof Stream receipt, or revoke operation is claimed.
            A configuration alone never creates authority.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/operator-ceremony">
              Begin operator ceremony
            </Link>
            <Link className="button button-primary" href="/lp-activate">
              Configure LP boundaries
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
                <h2>What must exist first</h2>
              </div>
              <span className="state-badge state-caution">All absent</span>
            </div>
            <ul>
              <li>A wallet-bound, hash-stable permission policy and plain-language preview.</li>
              <li>A worker-held public session descriptor granted by the admin passkey.</li>
              <li>
                A fresh authority probe matching wallet, key, permissions, expiry, and policy.
              </li>
              <li>Typed operation state with real call or transaction evidence when available.</li>
            </ul>
          </article>

          <article className="passport-panel">
            <div className="passport-panel-heading">
              <div>
                <span className="step-number">02</span>
                <h2>Revocation truth rule</h2>
              </div>
              <span className="state-badge state-unknown">Fail closed</span>
            </div>
            <p>
              A revoke click or relay-confirmed response is not displayed as revoked. Authority
              stays visibly active or pending until a fresh, exactly bound account read proves that
              the session is absent. Unknown outcomes are never retried blindly.
            </p>
          </article>
        </div>

        <footer className="registry-footnote">
          <strong>Environment:</strong> the first activation proof is designed for BSC testnet chain
          97. This empty state is not a testnet transaction, live-agent, or revoke receipt.
        </footer>
      </section>
    </main>
  );
}
