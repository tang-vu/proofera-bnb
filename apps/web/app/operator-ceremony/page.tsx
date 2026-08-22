import type { Metadata } from "next";
import Link from "next/link";

import { altanaTestActionConfigSchema } from "@proofera/integrations";

import altanaTestActionConfig from "../../../../deploy/windows/altana-test-action.v2.json";

import { readPasskeyRuntimeConfig } from "../../lib/runtime-config";
import { CeremonyConsole } from "./ceremony-console";

export const metadata: Metadata = { title: "Operator ceremony" };
export const dynamic = "force-dynamic";

export default function OperatorCeremonyPage() {
  const passkey = readPasskeyRuntimeConfig();
  const altanaTestAction = altanaTestActionConfigSchema.parse(altanaTestActionConfig);

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
          <Link className="nav-optional" href="/proof">
            Proof room
          </Link>
          <span className="nav-current">Operator ceremony</span>
          <span className="network-pill">Testnet only</span>
        </div>
      </nav>

      <header className="shell marketplace-hero ceremony-hero">
        <span className="eyebrow">BOUNDED NON-AGENT BASELINES / MINIMAL OWNER INPUT</span>
        <h1>Start once. Stay inside one ceremony.</h1>
        <p className="lede">
          ProofEra precomputes the bounded non-agent worksheets and asks the owner only to review
          and accept each displayed conclusion. Passkey presence, receipts, and revocation remain
          separate security transitions. Starting the session creates no evidence by itself.
        </p>
      </header>

      <CeremonyConsole
        altanaTestAction={altanaTestAction}
        canonicalOrigin={passkey.origin}
        rpId={passkey.rpId}
      />
    </main>
  );
}
