import Link from "next/link";

export default function AgentNotFound() {
  return (
    <main className="shell not-found-page" id="main-content" tabIndex={-1}>
      <span className="eyebrow">AGENT PASSPORT</span>
      <h1>Identity not found.</h1>
      <p className="lede">
        The route is invalid or 8004scan returned a validated not-found response. ProofEra does not
        replace missing identities with fixtures.
      </p>
      <Link className="button button-primary" href="/marketplace">
        Return to marketplace
      </Link>
    </main>
  );
}
