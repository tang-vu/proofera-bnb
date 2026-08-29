import type { Metadata } from "next";
import Link from "next/link";

import {
  parseLpActivationQuery,
  type LpActivationFormValues,
  type LpActivationQueryField,
  type LpActivationQueryIssue,
  type LpActivationSearchParams
} from "../../lib/lp-activation-query";

export const metadata: Metadata = { title: "LP configuration readiness" };
export const dynamic = "force-dynamic";

interface LpActivatePageProps {
  readonly searchParams: Promise<LpActivationSearchParams>;
}

function hasIssue(issues: readonly LpActivationQueryIssue[], field: LpActivationQueryField) {
  return issues.some((issue) => issue.field === field || issue.field === "query");
}

function ConfigurationForm({
  values,
  issues = []
}: Readonly<{
  values: LpActivationFormValues;
  issues?: readonly LpActivationQueryIssue[];
}>) {
  return (
    <form className="intent-form" action="/lp-activate" method="get">
      <input name="schemaVersion" type="hidden" value="1" />
      <div className="panel-heading">
        <span className="step-number">01</span>
        <div>
          <p className="panel-overline">USER-CONTROLLED FIELDS ONLY</p>
          <h2 id="lp-configuration-form-heading">Define the boundaries</h2>
        </div>
      </div>

      <label>
        BSC network
        <select
          aria-invalid={hasIssue(issues, "chainId")}
          defaultValue={values.chainId}
          name="chainId"
          required
        >
          <option value="97">BSC testnet (97)</option>
        </select>
      </label>

      <div className="form-grid">
        <label>
          Intended execution wallet (not connected)
          <input
            aria-invalid={hasIssue(issues, "wallet")}
            autoComplete="off"
            defaultValue={values.wallet}
            maxLength={42}
            name="wallet"
            placeholder="0x…"
            required
            spellCheck={false}
          />
        </label>
        <label>
          Recipient address
          <input
            aria-describedby="lp-recipient-rule"
            aria-invalid={hasIssue(issues, "recipient")}
            autoComplete="off"
            defaultValue={values.recipient}
            maxLength={42}
            name="recipient"
            placeholder="Must match wallet"
            required
            spellCheck={false}
          />
        </label>
        <label>
          Pancake V3 pool address
          <input
            aria-invalid={hasIssue(issues, "poolAddress")}
            autoComplete="off"
            defaultValue={values.poolAddress}
            maxLength={42}
            name="poolAddress"
            placeholder="0x…"
            required
            spellCheck={false}
          />
        </label>
        <label>
          Position token ID
          <input
            aria-invalid={hasIssue(issues, "positionTokenId")}
            defaultValue={values.positionTokenId}
            inputMode="numeric"
            maxLength={78}
            name="positionTokenId"
            pattern="[0-9]*"
            placeholder="Canonical uint256"
            required
          />
        </label>
        <label>
          Desired lower tick
          <input
            aria-invalid={hasIssue(issues, "tickLower")}
            defaultValue={values.tickLower}
            max="887272"
            min="-887272"
            name="tickLower"
            required
            step="1"
            type="number"
          />
        </label>
        <label>
          Desired upper tick
          <input
            aria-invalid={hasIssue(issues, "tickUpper")}
            defaultValue={values.tickUpper}
            max="887272"
            min="-887272"
            name="tickUpper"
            required
            step="1"
            type="number"
          />
        </label>
        <label>
          Token 0 capital / raw units
          <input
            aria-invalid={hasIssue(issues, "capitalToken0Raw")}
            defaultValue={values.capitalToken0Raw}
            inputMode="numeric"
            maxLength={78}
            name="capitalToken0Raw"
            pattern="[0-9]*"
            placeholder="Positive uint256"
            required
          />
        </label>
        <label>
          Token 1 capital / raw units
          <input
            aria-invalid={hasIssue(issues, "capitalToken1Raw")}
            defaultValue={values.capitalToken1Raw}
            inputMode="numeric"
            maxLength={78}
            name="capitalToken1Raw"
            pattern="[0-9]*"
            placeholder="Positive uint256"
            required
          />
        </label>
        <label>
          Maximum slippage / bps
          <input
            aria-invalid={hasIssue(issues, "maxSlippageBps")}
            defaultValue={values.maxSlippageBps}
            max="100"
            min="1"
            name="maxSlippageBps"
            required
            step="1"
            type="number"
          />
        </label>
        <label>
          Session duration / seconds
          <input
            aria-invalid={hasIssue(issues, "sessionDurationSeconds")}
            defaultValue={values.sessionDurationSeconds}
            max="86400"
            min="300"
            name="sessionDurationSeconds"
            required
            step="1"
            type="number"
          />
        </label>
        <label>
          Deadline / seconds
          <input
            aria-invalid={hasIssue(issues, "txDeadlineSeconds")}
            defaultValue={values.txDeadlineSeconds}
            max="1800"
            min="30"
            name="txDeadlineSeconds"
            required
            step="1"
            type="number"
          />
        </label>
        <label>
          Maximum executions / day
          <input
            aria-invalid={hasIssue(issues, "maxExecutionsPerDay")}
            defaultValue={values.maxExecutionsPerDay}
            max="144"
            min="1"
            name="maxExecutionsPerDay"
            required
            step="1"
            type="number"
          />
        </label>
      </div>
      <p className="registry-footnote" id="lp-recipient-rule">
        Recipient must exactly match the intended wallet. No authentication or connection occurs on
        this page. Token identities, decimals, current tick, tick spacing, ownership, code identity,
        and quote values are intentionally not entered here.
      </p>
      <button className="button button-primary" type="submit">
        Review one-time mandate
      </button>
    </form>
  );
}

function BlankState() {
  return (
    <aside className="intent-readout pancake-query-state" role="status">
      <p className="panel-overline">NO CONFIGURATION YET</p>
      <h2>Set user boundaries first.</h2>
      <p>
        No wallet, network, or protocol request has been made. Completing this form creates only a
        normalized configuration for review.
      </p>
      <div className="decision-hold">
        <strong>Readiness remains blocked</strong>
        <p>Trusted evidence and permission artifacts are not collected on this page.</p>
      </div>
    </aside>
  );
}

function InvalidState({ issues }: Readonly<{ issues: readonly LpActivationQueryIssue[] }>) {
  return (
    <aside className="intent-readout pancake-query-state" role="alert">
      <p className="panel-overline">CONFIGURATION REJECTED</p>
      <h2>Correct the user boundary.</h2>
      <p>No wallet, network, or protocol request was made.</p>
      <ul>
        {issues.map((issue) => (
          <li key={`${issue.field}:${issue.message}`}>
            <strong>{issue.field}:</strong> {issue.message}
          </li>
        ))}
      </ul>
      <div className="decision-hold">
        <strong>Nothing trusted was inferred</strong>
        <p>Rejected fields cannot become contract, ownership, token, quote, or policy evidence.</p>
      </div>
    </aside>
  );
}

function ConfigurationRequest({ values }: Readonly<{ values: LpActivationFormValues }>) {
  return (
    <aside className="intent-readout" aria-label="Normalized configuration request">
      <p className="panel-overline">NORMALIZED USER REQUEST</p>
      <h2>BSC testnet configuration</h2>
      <dl>
        <div>
          <dt>Wallet</dt>
          <dd className="raw-value">{values.wallet}</dd>
        </div>
        <div>
          <dt>Pool</dt>
          <dd className="raw-value">{values.poolAddress}</dd>
        </div>
        <div>
          <dt>Position</dt>
          <dd className="raw-value">{values.positionTokenId}</dd>
        </div>
        <div>
          <dt>State</dt>
          <dd>Configuration only</dd>
        </div>
      </dl>
      <div className="decision-hold">
        <strong>No permission preview exists</strong>
        <p>A trusted server evidence context is required before policy construction can begin.</p>
      </div>
    </aside>
  );
}

export default async function LpActivatePage({ searchParams }: LpActivatePageProps) {
  const state = parseLpActivationQuery(await searchParams);

  return (
    <main id="main-content" tabIndex={-1}>
      <header className="shell pancake-position-header">
        <span className="eyebrow">LP RANGE AGENT / ONE-TIME MANDATE DESIGN</span>
        <h1>Grant once. Keep every action bounded.</h1>
        <p className="lede">
          Set range, capital, slippage, frequency, and expiry before authority exists. Once exact
          server evidence produces a permission preview and the owner grants it, the agent may act
          inside that mandate without asking for another transaction signature.
        </p>
      </header>

      <section className="shell pancake-inspector" aria-labelledby="lp-configuration-form-heading">
        <ConfigurationForm
          values={state.formValues}
          issues={state.status === "invalid" ? state.issues : []}
        />
        {state.status === "blank" ? (
          <BlankState />
        ) : state.status === "invalid" ? (
          <InvalidState issues={state.issues} />
        ) : (
          <ConfigurationRequest values={state.formValues} />
        )}
      </section>

      <section className="shell section" aria-labelledby="lp-authorization-model-heading">
        <div className="section-heading">
          <div>
            <span className="eyebrow">AUTHORIZATION MODEL</span>
            <h2 id="lp-authorization-model-heading">One grant is the boundary.</h2>
          </div>
          <p>
            Repeated owner prompts are reserved for permission changes, not routine actions that
            already satisfy the granted policy.
          </p>
        </div>
        <div className="passport-grid">
          <article className="passport-panel">
            <div className="passport-panel-heading">
              <div>
                <span className="step-number">A</span>
                <h3>Within policy</h3>
              </div>
              <span className="state-badge state-available">No re-sign</span>
            </div>
            <p>
              Exact chain, wallet, contract, selector, calldata constraints, spend cap, expiry,
              quote freshness, deadline, idempotency, and simulation must all pass.
            </p>
          </article>
          <article className="passport-panel">
            <div className="passport-panel-heading">
              <div>
                <span className="step-number">B</span>
                <h3>Runtime failure</h3>
              </div>
              <span className="state-badge state-caution">Block</span>
            </div>
            <p>
              Stale data, policy mismatch, failed simulation, duplicate intent, or exhausted daily
              limits stop the action. They do not trigger an automatic permission expansion.
            </p>
          </article>
          <article className="passport-panel">
            <div className="passport-panel-heading">
              <div>
                <span className="step-number">C</span>
                <h3>Scope expansion</h3>
              </div>
              <span className="state-badge state-unknown">Fresh grant</span>
            </div>
            <p>
              A different chain, call, token, higher cap, expired session, or revoked session
              requires the owner to review and grant a new mandate.
            </p>
          </article>
        </div>
      </section>

      {state.status !== "configured" ? null : (
        <section className="shell pancake-result" aria-labelledby="lp-readiness-heading">
          <div className="pancake-result-heading">
            <div>
              <span className="state-badge state-caution">Readiness blocked</span>
              <h2 id="lp-readiness-heading">Configuration captured. Authority absent.</h2>
            </div>
            <span className="state-badge state-caution">BSC testnet / chain 97</span>
          </div>

          <div className="unavailable-panel" role="status">
            <div>
              <h3>No trusted handoff has occurred.</h3>
              <p>{state.readiness.scopeBoundary}</p>
            </div>
            <ul>
              {state.readiness.blockers.map((blocker) => (
                <li key={blocker.code}>
                  <strong>{blocker.code.replaceAll("_", " ")}</strong>
                  <br />
                  {blocker.message}
                </li>
              ))}
            </ul>
          </div>

          <div className="passport-grid">
            <article className="passport-panel">
              <div className="passport-panel-heading">
                <div>
                  <span className="step-number">02</span>
                  <h2>Position request</h2>
                </div>
                <span className="state-badge state-unknown">User supplied</span>
              </div>
              <dl className="pancake-facts">
                <div>
                  <dt>Wallet and recipient</dt>
                  <dd className="raw-value">{state.configuration.wallet}</dd>
                </div>
                <div>
                  <dt>Pool</dt>
                  <dd className="raw-value">{state.configuration.poolAddress}</dd>
                </div>
                <div>
                  <dt>Position token ID</dt>
                  <dd className="raw-value">{state.configuration.positionTokenId}</dd>
                </div>
                <div>
                  <dt>Desired ticks</dt>
                  <dd>
                    lower {state.configuration.desiredTick.lower} / upper{" "}
                    {state.configuration.desiredTick.upper}
                  </dd>
                </div>
                <div>
                  <dt>Evidence status</dt>
                  <dd>Pool, position, tick spacing, and ownership are not yet verified.</dd>
                </div>
              </dl>
            </article>

            <article className="passport-panel">
              <div className="passport-panel-heading">
                <div>
                  <span className="step-number">03</span>
                  <h2>Capital and runtime limits</h2>
                </div>
                <span className="state-badge state-unknown">Raw units</span>
              </div>
              <dl className="pancake-facts">
                <div>
                  <dt>Token 0 capital / raw</dt>
                  <dd className="raw-value">{state.configuration.capital.token0Raw}</dd>
                </div>
                <div>
                  <dt>Token 1 capital / raw</dt>
                  <dd className="raw-value">{state.configuration.capital.token1Raw}</dd>
                </div>
                <div>
                  <dt>Maximum slippage</dt>
                  <dd>{state.configuration.maxSlippageBps} bps</dd>
                </div>
                <div>
                  <dt>Session duration</dt>
                  <dd>{state.configuration.sessionDurationSeconds} seconds</dd>
                </div>
                <div>
                  <dt>Deadline</dt>
                  <dd>{state.configuration.txDeadlineSeconds} seconds</dd>
                </div>
                <div>
                  <dt>Maximum executions</dt>
                  <dd>{state.configuration.maxExecutionsPerDay} per day</dd>
                </div>
                <div>
                  <dt>Token metadata</dt>
                  <dd>Unknown until trusted token addresses and decimals are established.</dd>
                </div>
              </dl>
            </article>
          </div>

          <div className="decision-hold pancake-identity-boundary">
            <strong>Next gate: trusted evidence, then one owner grant</strong>
            <p>
              Only after exact contract code, factory/pool relations, position ownership, token
              decimals, a pinned block, and fresh minimum-output provenance are verified can a
              hash-stable permission policy be constructed. After that single grant, matching
              actions do not need another signature.
            </p>
            <Link className="text-link" href="/session-control">
              Inspect the verified session-key flow <span aria-hidden="true">→</span>
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}
