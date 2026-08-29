import type { Metadata } from "next";
import Link from "next/link";

import { altanaTestActionConfigSchema } from "@proofera/integrations";

import altanaTestActionConfig from "../../../../deploy/windows/altana-test-action.v2.json";

import { readPasskeyRuntimeConfig } from "../../lib/runtime-config";
import { AltanaPasskeyCeremony } from "../operator-ceremony/altana-passkey-ceremony";
import { AltanaSessionCeremony } from "../operator-ceremony/altana-session-ceremony";

export const metadata: Metadata = {
  title: "Session control",
  description:
    "Grant one scoped BSC-testnet session, let the worker act inside it, and revoke from one control surface."
};
export const dynamic = "force-dynamic";

const behavior = [
  {
    label: "Inside the mandate",
    state: "No new signature",
    detail:
      "The worker may submit only after chain, wallet, contract, selector, calldata, cap, expiry, freshness, idempotency, and simulation checks pass."
  },
  {
    label: "Runtime evidence fails",
    state: "Block automatically",
    detail:
      "A stale quote, failed simulation, policy mismatch, duplicate action, exhausted limit, or unknown authority stops execution without asking for a broader grant."
  },
  {
    label: "Scope changes",
    state: "Owner returns",
    detail:
      "A new chain, contract, selector, token, higher cap, expired session, or revoked session requires a fresh, explicit owner grant."
  }
] as const;

export default function SessionControlPage() {
  const passkey = readPasskeyRuntimeConfig();
  const altanaTestAction = altanaTestActionConfigSchema.parse(altanaTestActionConfig);

  return (
    <main id="main-content" tabIndex={-1}>
      <header className="shell marketplace-hero ceremony-hero">
        <span className="eyebrow">ONE OWNER GRANT / BOUNDED AGENT AUTHORITY</span>
        <h1>Grant once. Stay inside limits.</h1>
        <p className="lede">
          Review chain, calls, spend cap, expiry, and the worker identity once. After the grant is
          observed onchain, actions that remain inside that exact mandate do not require another
          wallet signature. Pause, revoke, or any scope expansion returns control to the owner.
        </p>
      </header>

      <section className="shell section" aria-labelledby="mandate-behavior-heading">
        <div className="section-heading">
          <div>
            <span className="eyebrow">HOW AUTHORIZATION BEHAVES</span>
            <h2 id="mandate-behavior-heading">Autonomy is bounded, not repetitive.</h2>
          </div>
          <p>
            The owner authorizes a durable policy, not each transaction. Runtime failures fail
            closed; they never silently widen permission or become a success claim.
          </p>
        </div>
        <div className="passport-grid">
          {behavior.map((item, index) => (
            <article className="passport-panel" key={item.label}>
              <div className="passport-panel-heading">
                <div>
                  <span className="step-number">{String(index + 1).padStart(2, "0")}</span>
                  <h3>{item.label}</h3>
                </div>
                <span className="state-badge state-unknown">{item.state}</span>
              </div>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="shell ceremony-passkey-start" aria-label="Altana session controls">
        <AltanaPasskeyCeremony
          canonicalOrigin={passkey.origin}
          canonicalPath="/session-control"
          rpId={passkey.rpId}
        />
        <AltanaSessionCeremony config={altanaTestAction} rpId={passkey.rpId} />
      </section>

      <section className="shell unavailable-panel" aria-labelledby="session-proof-boundary">
        <div>
          <span className="state-badge state-caution">Bounded proof fixture</span>
          <h2 id="session-proof-boundary">This control proves session mechanics, not LP profit.</h2>
          <p>
            The current write target is the fixed-supply PTA test asset and the pinned application
            action is approve(address,uint256) with amount 0 and value 0. It does not add liquidity,
            mint an LP position, transfer value, or prove economic benefit.
          </p>
        </div>
        <div className="hero-actions">
          <Link className="button button-primary" href="/lp-activate">
            Configure LP mandate
          </Link>
          <Link className="button button-secondary" href="/mission-control">
            Inspect verified lifecycle
          </Link>
        </div>
      </section>
    </main>
  );
}
