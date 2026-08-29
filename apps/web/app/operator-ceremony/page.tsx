import type { Metadata } from "next";
import Link from "next/link";

import { altanaTestActionConfigSchema } from "@proofera/integrations";

import altanaTestActionConfig from "../../../../deploy/windows/altana-test-action.v2.json";

import { readPasskeyRuntimeConfig } from "../../lib/runtime-config";
import { CeremonyConsole } from "./ceremony-console";

export const metadata: Metadata = {
  title: "Internal evidence ceremony",
  robots: { index: false, follow: false }
};
export const dynamic = "force-dynamic";

export default function OperatorCeremonyPage() {
  const passkey = readPasskeyRuntimeConfig();
  const altanaTestAction = altanaTestActionConfigSchema.parse(altanaTestActionConfig);

  return (
    <main id="main-content" tabIndex={-1}>
      <header className="shell marketplace-hero ceremony-hero">
        <span className="eyebrow">INTERNAL EVIDENCE TOOL / NOT THE PRODUCT ENTRY POINT</span>
        <h1>Reproduce bounded evidence checkpoints.</h1>
        <p className="lede">
          This retained operator route reproduces bounded non-agent worksheets and security
          checkpoints. Judges and users should enter through Session Control; opening this internal
          route creates no evidence, authority, receipt, or completion claim by itself.
        </p>
        <div className="hero-actions">
          <Link className="button button-primary" href="/session-control">
            Open Session Control
          </Link>
        </div>
      </header>

      <CeremonyConsole
        altanaTestAction={altanaTestAction}
        canonicalOrigin={passkey.origin}
        rpId={passkey.rpId}
      />
    </main>
  );
}
