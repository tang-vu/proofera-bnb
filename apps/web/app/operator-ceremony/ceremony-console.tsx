"use client";

import { useSyncExternalStore } from "react";

import type { AltanaTestActionConfig } from "@proofera/integrations";

import { AltanaPasskeyCeremony } from "./altana-passkey-ceremony";
import { AltanaSessionCeremony } from "./altana-session-ceremony";

const SESSION_STORAGE_KEY = "proofera.operator-ceremony.started-at.v1";
const SESSION_EVENT = "proofera-operator-ceremony-change";

const steps = [
  {
    number: "01",
    title: "LP without-agent baseline",
    state: "One review click",
    detail:
      "The local runner reproduces the exact-hash slot0 read and prepares the only conclusion supported by the frozen economics. Review the displayed facts and accept once; it never invokes the registered agent.",
    localRunner: true
  },
  {
    number: "02",
    title: "Venus without-agent baseline",
    state: "One review click",
    detail:
      "The local runner recomputes all integer health factors and prepares the bounded read-only conclusion. Review the displayed facts and accept once; it never invokes the Health Guardian agent.",
    localRunner: true
  },
  {
    number: "03",
    title: "Altana grant and test action",
    state: "Ready after faucet funding",
    detail:
      "The device-bound passkey grants one one-hour session scoped to PTA approve(address,uint256). The dedicated DPAPI worker signs only the pinned amount-0/value-0 calldata after two RPCs observe authority, then publishes only public receipt state."
  },
  {
    number: "04",
    title: "Revoke and negative-authority proof",
    state: "Waits for a real grant",
    detail:
      "Revocation is a separate security transition. Completion requires a receipt and a fresh onchain probe proving that the scoped session no longer has authority."
  }
] as const;

export function CeremonyConsole({
  altanaTestAction,
  canonicalOrigin,
  rpId
}: Readonly<{
  altanaTestAction: AltanaTestActionConfig;
  canonicalOrigin: string;
  rpId: string;
}>) {
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
      <>
        <section
          className="shell ceremony-start ceremony-start-with-passkey"
          aria-labelledby="ceremony-start-heading"
        >
          <div>
            <span className="state-badge state-caution">No ceremony in progress</span>
            <h2 id="ceremony-start-heading">One entry point. Four evidence checkpoints.</h2>
            <p>
              This public page cannot write benchmark evidence. The button reveals the local-only
              launcher that runs on the owner&apos;s Windows host; it cannot accept the displayed
              facts for you, submit a transaction, or claim that a checkpoint passed.
            </p>
          </div>
          <button className="button button-primary" onClick={beginCeremony} type="button">
            Show local runner
          </button>
        </section>
        <div className="shell ceremony-passkey-start">
          <AltanaPasskeyCeremony
            canonicalOrigin={canonicalOrigin}
            canonicalPath="/operator-ceremony"
            rpId={rpId}
          />
          <AltanaSessionCeremony config={altanaTestAction} rpId={rpId} />
        </div>
      </>
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

      <aside className="ceremony-local-runner" aria-label="Local ceremony launcher">
        <span>On the always-on Windows host</span>
        <code>Start ProofEra Ceremony.cmd</code>
        <p>
          Double-click this tracked launcher in the repository root. It opens a private 127.0.0.1
          worksheet, starts LP automatically, records timed without-agent review, and commits only
          an isolated validated capture. Venus opens automatically after LP, so no typing, terminal
          command, decision selection, or rationale entry is required.
        </p>
      </aside>

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
            {"localRunner" in step ? (
              <div className="ceremony-command" aria-label={`${step.title} local runner boundary`}>
                <span>Handled inside the local ceremony runner</span>
                <code>No raw NDJSON or terminal command entry required.</code>
              </div>
            ) : null}
          </li>
        ))}
      </ol>

      <AltanaPasskeyCeremony
        canonicalOrigin={canonicalOrigin}
        canonicalPath="/operator-ceremony"
        rpId={rpId}
      />
      <AltanaSessionCeremony config={altanaTestAction} rpId={rpId} />

      <aside className="unavailable-panel" role="status">
        <div>
          <h3>What still requires presence</h3>
          <p>
            Each visible baseline must be accepted after review, and WebAuthn requires user presence
            at a protected operation. The hackathon asks for a without-agent comparison, not an
            invented human identity; missing output or authority remains missing.
          </p>
        </div>
      </aside>
    </section>
  );
}
