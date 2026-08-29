export default function YieldSourcesLoading() {
  return (
    <main aria-busy="true" id="main-content" tabIndex={-1}>
      <header className="shell route-loading-header">
        <span className="eyebrow">LISTA MOOLAH / OFFICIAL API READ</span>
        <h1>Reading current Lista yield-source fields.</h1>
        <p className="lede">
          The request is bounded to the official BSC-mainnet vault-list endpoint. Raw source
          decimals will not be converted while their scale is undocumented.
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
          <strong>Waiting for Lista</strong>
        </div>
        <p>
          No fixture, cached claim, or invented vault record will replace an empty, failed, or
          incompatible response.
        </p>
      </section>
    </main>
  );
}
