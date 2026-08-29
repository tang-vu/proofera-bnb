import Link from "next/link";

const productLinks = [
  ["Marketplace", "/marketplace"],
  ["Proof room", "/proof"],
  ["Mission Control", "/mission-control"],
  ["Session control", "/session-control"]
] as const;

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell site-footer-inner">
        <div className="site-footer-callout">
          <div>
            <span className="eyebrow">PROOF SURVIVES THE HANDOFF</span>
            <h2>See the evidence before authority moves.</h2>
          </div>
          <Link className="button button-secondary button-arrow" href="/proof">
            Open proof room <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <div className="site-footer-bottom">
          <Link className="wordmark" href="/" aria-label="Return to homepage">
            <span aria-hidden="true" className="mark">
              P
            </span>
            ProofEra
          </Link>
          <nav aria-label="Footer navigation">
            {productLinks.map(([label, href]) => (
              <Link href={href} key={href}>
                {label}
              </Link>
            ))}
          </nav>
          <p>
            <span aria-hidden="true" className="footer-live-dot" /> BSC testnet first · Evidence,
            scope, receipt, revoke.
          </p>
        </div>
      </div>
    </footer>
  );
}
