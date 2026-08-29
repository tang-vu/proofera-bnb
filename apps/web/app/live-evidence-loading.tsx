interface LiveEvidenceLoadingProps {
  readonly title: string;
  readonly detail: string;
}

export function LiveEvidenceLoading({ title, detail }: LiveEvidenceLoadingProps) {
  return (
    <main aria-busy="true" id="main-content" tabIndex={-1}>
      <header className="shell route-loading-header">
        <span className="eyebrow">LIVE EVIDENCE REQUEST</span>
        <h1>{title}</h1>
        <p className="lede">{detail}</p>
      </header>

      <section
        aria-atomic="true"
        aria-live="polite"
        className="shell route-loading-panel"
        role="status"
      >
        <div>
          <span aria-hidden="true" className="status-dot status-dot-pending" />
          <strong>Waiting for 8004scan</strong>
        </div>
        <p>
          ProofEra is requesting current registry evidence. No fixture or invented result will be
          substituted if the source cannot answer.
        </p>
      </section>
    </main>
  );
}
