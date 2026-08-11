import Link from "next/link";

export default function MarketplaceLoading() {
  return (
    <main aria-busy="true" id="main-content" tabIndex={-1}>
      <nav className="shell nav" aria-label="Primary navigation">
        <Link className="wordmark" href="/" aria-label="ProofEra home">
          <span aria-hidden="true" className="mark">
            P
          </span>
          ProofEra
        </Link>
        <div className="nav-links">
          <span className="nav-current">Marketplace</span>
          <span className="network-pill">BSC source reads</span>
        </div>
      </nav>

      <header className="shell route-loading-header">
        <span className="eyebrow">INTENT BEFORE INVENTORY</span>
        <h1>Start with the job.</h1>
        <p className="lede">
          Opening the mandate controls and analyzer dossiers. Live registry evidence loads in its
          own independent region.
        </p>
      </header>

      <section
        aria-atomic="true"
        aria-live="polite"
        className="shell route-loading-panel"
        role="status"
      >
        <div>
          <span aria-hidden="true" className="status-dot status-dot-pending" />
          <strong>Preparing the marketplace shell</strong>
        </div>
        <p>
          No registry result, fixture, or performance claim is shown during this route transition.
        </p>
      </section>
    </main>
  );
}
