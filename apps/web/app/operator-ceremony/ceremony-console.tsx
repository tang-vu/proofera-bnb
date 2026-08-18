"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

const SESSION_STORAGE_KEY = "proofera.operator-ceremony.started-at.v1";
const SESSION_EVENT = "proofera-operator-ceremony-change";

const steps = [
  {
    number: "01",
    title: "LP manual baseline",
    state: "Human result required",
    detail:
      "Review the frozen PancakeSwap position, reproduce the exact-hash slot0 read, and enter your own bounded decision. The registered agent must not be used.",
    command:
      "pnpm run:termix:pancake-lp-manual -- --execute-exact-pancake-lp-manual-run --input-bundle evidence/termix/frozen/pancake-lp/116342186-7152618.canonical-json"
  },
  {
    number: "02",
    title: "Venus manual baseline",
    state: "Human result required",
    detail:
      "Review the frozen Venus window, recompute the integer health factors, and enter your own read-only decision without invoking the Health Guardian agent.",
    command:
      "pnpm run:termix:venus-manual -- --execute-exact-venus-health-manual-run --request-input evidence/termix/frozen/venus-health/3ba85859ced3-125563831-125564152.canonical-json"
  },
  {
    number: "03",
    title: "Altana grant and test action",
    state: "Authority prerequisites absent",
    detail:
      "The final-origin passkey, dedicated worker session signer, eligible write target, and fresh authority probe must exist before a grant can be requested. No passkey prompt is available yet.",
    href: "/lp-activate",
    linkLabel: "Review LP boundaries"
  },
  {
    number: "04",
    title: "Revoke and negative-authority proof",
    state: "Waits for a real grant",
    detail:
      "Revocation is a separate security transition. Completion requires a receipt and a fresh onchain probe proving that the scoped session no longer has authority."
  }
] as const;

export function CeremonyConsole() {
  const startedAt = useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener(SESSION_EVENT, onStoreChange);
      window.addEventListener("storage", onStoreChange);
      return () => {
        window.removeEventListener(SESSION_EVENT, onStoreChange);
        window.removeEventListener("storage", onStoreChange);
      };
    },
    () => window.sessionStorage.getItem(SESSION_STORAGE_KEY),
    () => null
  );

  function beginCeremony() {
    const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    const timestamp = existing ?? new Date().toISOString();
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, timestamp);
    window.dispatchEvent(new Event(SESSION_EVENT));
    window.requestAnimationFrame(() => {
      document.getElementById("ceremony-steps")?.focus();
    });
  }

  if (startedAt === null) {
    return (
      <section className="shell ceremony-start" aria-labelledby="ceremony-start-heading">
        <div>
          <span className="state-badge state-caution">No ceremony in progress</span>
          <h2 id="ceremony-start-heading">One entry point. Four evidence checkpoints.</h2>
          <p>
            This button starts one guided browser session. It does not manufacture a manual result,
            invoke a passkey, submit a transaction, or claim that any checkpoint passed.
          </p>
        </div>
        <button className="button button-primary" onClick={beginCeremony} type="button">
          Begin operator ceremony
        </button>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="ceremony-steps-heading"
      className="shell ceremony-session"
      id="ceremony-steps"
      tabIndex={-1}
    >
      <div className="ceremony-session-heading">
        <div>
          <span className="state-badge state-caution">Session started</span>
          <h2 id="ceremony-steps-heading">Keep this page open for the whole ceremony.</h2>
        </div>
        <dl className="ceremony-session-meta">
          <div>
            <dt>Started at</dt>
            <dd>{startedAt}</dd>
          </div>
          <div>
            <dt>Evidence state</dt>
            <dd>Nothing completed by this page</dd>
          </div>
        </dl>
      </div>

      <ol className="ceremony-step-list">
        {steps.map((step) => (
          <li className="ceremony-step" key={step.number}>
            <div className="ceremony-step-heading">
              <span className="step-number">{step.number}</span>
              <div>
                <h3>{step.title}</h3>
                <span className="state-badge state-unknown">{step.state}</span>
              </div>
            </div>
            <p>{step.detail}</p>
            {"command" in step ? (
              <div className="ceremony-command" aria-label={`${step.title} command`}>
                <span>Run from the repository root</span>
                <code>{step.command}</code>
              </div>
            ) : null}
            {"href" in step ? (
              <Link className="button button-secondary" href={step.href}>
                {step.linkLabel}
              </Link>
            ) : null}
          </li>
        ))}
      </ol>

      <aside className="unavailable-panel" role="status">
        <div>
          <h3>Why this cannot truthfully finish on the first click</h3>
          <p>
            The two manual conclusions must come from an independent human, and WebAuthn requires
            user presence at the protected operation. Missing output or authority remains missing.
          </p>
        </div>
      </aside>
    </section>
  );
}
