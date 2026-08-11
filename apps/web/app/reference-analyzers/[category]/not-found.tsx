import Link from "next/link";

export default function ReferenceAnalyzerNotFound() {
  return (
    <main className="shell not-found-page" id="main-content" tabIndex={-1}>
      <span className="eyebrow">REFERENCE ANALYZER DOSSIER</span>
      <h1>Analyzer category not found.</h1>
      <p className="lede">
        ProofEra exposes exactly four repository-backed reference categories. Unknown routes do not
        create a fixture, agent identity, performance claim, or execution path.
      </p>
      <Link className="button button-primary" href="/marketplace">
        Return to marketplace
      </Link>
    </main>
  );
}
