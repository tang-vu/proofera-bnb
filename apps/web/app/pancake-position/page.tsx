import {
  PANCAKE_V3_BSC_DEPLOYMENTS,
  type PancakeV3LatestAvailableResult,
  type PancakeV3LatestSnapshotProvenance
} from "@proofera/integrations";
import type { Metadata } from "next";
import Link from "next/link";

import {
  resolvePancakePositionQuery,
  type PancakePositionInput,
  type PancakePositionSearchParams
} from "../../lib/pancake-position-query";
import { loadLivePancakePosition } from "../../lib/pancake-position-rpc";
import type { PancakePositionRouteResult } from "../../lib/pancake-position-service";

export const metadata: Metadata = { title: "Pancake V3 position evidence" };
export const dynamic = "force-dynamic";

interface PancakePositionPageProps {
  readonly searchParams: Promise<PancakePositionSearchParams>;
}

const explorerOrigins = {
  56: "https://bscscan.com",
  97: "https://testnet.bscscan.com"
} as const;

const deploymentManifestUrls = {
  56: "https://github.com/pancakeswap/pancake-v3-contracts/blob/986847948755cba528324d41be19480731c36c2a/deployments/bscMainnet.json",
  97: "https://github.com/pancakeswap/pancake-v3-contracts/blob/986847948755cba528324d41be19480731c36c2a/deployments/bscTestnet.json"
} as const;

function networkLabel(chainId: 56 | 97): string {
  return chainId === 56 ? "BSC mainnet · chain 56" : "BSC testnet · chain 97";
}

function utc(value: string): string {
  return `${new Date(value).toLocaleString("en-GB", { timeZone: "UTC" })} UTC`;
}

function SourceLinks({
  input,
  blockNumber
}: Readonly<{ input: PancakePositionInput; blockNumber: string | null }>) {
  const deployment = PANCAKE_V3_BSC_DEPLOYMENTS[input.chainId];
  const explorer = explorerOrigins[input.chainId];

  return (
    <div className="pancake-source-links" aria-label="Verified source links">
      {blockNumber === null ? null : (
        <a href={`${explorer}/block/${blockNumber}`} rel="noreferrer" target="_blank">
          Block explorer <span aria-hidden="true">↗</span>
        </a>
      )}
      <a href={`${explorer}/address/${input.poolAddress}`} rel="noreferrer" target="_blank">
        Pool contract <span aria-hidden="true">↗</span>
      </a>
      <a
        href={`${explorer}/address/${deployment.positionManager}`}
        rel="noreferrer"
        target="_blank"
      >
        Position manager <span aria-hidden="true">↗</span>
      </a>
      <a href={`${explorer}/address/${deployment.factory}`} rel="noreferrer" target="_blank">
        V3 factory <span aria-hidden="true">↗</span>
      </a>
      <a href={deploymentManifestUrls[input.chainId]} rel="noreferrer" target="_blank">
        Official deployment manifest <span aria-hidden="true">↗</span>
      </a>
    </div>
  );
}

function ReadIdentityBoundary() {
  return (
    <div className="decision-hold pancake-identity-boundary">
      <strong>Read evidence, not write-manifest identity</strong>
      <p>
        Code presence and manager, pool, factory consistency show readable contracts and matching
        relationships at one block. They do not prove a reviewed deployed-code hash or write
        allowlist identity, and they authorize no transaction.
      </p>
    </div>
  );
}

function ProvenanceFacts({
  provenance
}: Readonly<{ provenance: PancakeV3LatestSnapshotProvenance }>) {
  return (
    <dl className="pancake-facts">
      <div>
        <dt>Observed</dt>
        <dd>{utc(provenance.observedAt)}</dd>
      </div>
      <div>
        <dt>Block time</dt>
        <dd>{utc(provenance.blockTimestamp)}</dd>
      </div>
      <div>
        <dt>Block</dt>
        <dd className="raw-value">{provenance.blockNumber}</dd>
      </div>
      <div>
        <dt>Block hash</dt>
        <dd className="raw-value">{provenance.blockHash}</dd>
      </div>
      <div>
        <dt>Block-hash binding</dt>
        <dd>
          Exact header fetched after the snapshot · the EVM batch itself binds block number,
          timestamp, and parent hash but cannot expose its own current hash
        </dd>
      </div>
      <div>
        <dt>Parent block hash · in-batch</dt>
        <dd className="raw-value">{provenance.parentBlockHash}</dd>
      </div>
      <div>
        <dt>Block age at observation</dt>
        <dd>{provenance.ageSeconds} seconds</dd>
      </div>
      <div>
        <dt>Read consistency</dt>
        <dd>
          {provenance.stageTwoAtomicCallCount} contract and block-context reads in one unsplit
          Multicall3 snapshot
        </dd>
      </div>
      <div>
        <dt>Contract identity</dt>
        <dd>Callable at snapshot · deployed-code hash not established</dd>
      </div>
    </dl>
  );
}

function AvailablePosition({
  input,
  result
}: Readonly<{
  input: PancakePositionInput;
  result: PancakeV3LatestAvailableResult;
}>) {
  const { position, pool } = result.snapshot;

  return (
    <>
      <div className="pancake-result-heading">
        <div>
          <span className="state-badge state-live">Read available</span>
          <h2 id="pancake-result-heading">Position evidence at one block</h2>
        </div>
        <span
          className={input.chainId === 97 ? "state-badge state-caution" : "state-badge state-live"}
        >
          {networkLabel(input.chainId)}
        </span>
      </div>

      <div className="pancake-evidence-grid">
        <article className="passport-panel">
          <div className="passport-panel-heading">
            <div>
              <span className="step-number">01</span>
              <h2>Position state</h2>
            </div>
            <span
              className={position.inRange ? "state-badge state-live" : "state-badge state-caution"}
            >
              {position.inRange ? "In range" : "Out of range"}
            </span>
          </div>
          <dl className="pancake-facts">
            <div>
              <dt>Position NFT ID</dt>
              <dd className="raw-value">{position.id}</dd>
            </div>
            <div>
              <dt>Token pair</dt>
              <dd className="raw-value">
                {position.token0}
                <br />
                {position.token1}
              </dd>
            </div>
            <div>
              <dt>Fee tier</dt>
              <dd>{position.fee}</dd>
            </div>
            <div>
              <dt>Ticks</dt>
              <dd>
                lower {position.tickLower} · current {pool.tick} · upper {position.tickUpper}
              </dd>
            </div>
            <div>
              <dt>Tick spacing</dt>
              <dd>{pool.tickSpacing}</dd>
            </div>
            <div>
              <dt>Range state</dt>
              <dd>
                {position.inRange
                  ? "Current tick is inside the position range"
                  : "Current tick is outside the position range"}
              </dd>
            </div>
            <div>
              <dt>Liquidity · raw units</dt>
              <dd className="raw-value">{position.liquidity}</dd>
            </div>
            <div>
              <dt>Token 0 owed · raw units</dt>
              <dd className="raw-value">{position.tokensOwed0}</dd>
            </div>
            <div>
              <dt>Token 1 owed · raw units</dt>
              <dd className="raw-value">{position.tokensOwed1}</dd>
            </div>
          </dl>
        </article>

        <article className="passport-panel">
          <div className="passport-panel-heading">
            <div>
              <span className="step-number">02</span>
              <h2>Provenance</h2>
            </div>
            <span className="state-badge state-live">Atomic block snapshot</span>
          </div>
          <ProvenanceFacts provenance={result.provenance} />
          <SourceLinks input={input} blockNumber={result.provenance.blockNumber} />
        </article>
      </div>
      <ReadIdentityBoundary />
    </>
  );
}

function unavailableObservedAt(
  result: Extract<PancakePositionRouteResult, { status: "unavailable" }>
): string {
  return result.observedAt ?? "Unknown";
}

function UnavailablePosition({
  input,
  result
}: Readonly<{
  input: PancakePositionInput;
  result: Extract<PancakePositionRouteResult, { readonly status: "unavailable" }>;
}>) {
  const observedAt = unavailableObservedAt(result);

  return (
    <>
      <div className="pancake-result-heading">
        <div>
          <span className="state-badge state-caution">Read unavailable</span>
          <h2 id="pancake-result-heading">No position snapshot was established</h2>
        </div>
        <span className="state-badge state-unknown">{networkLabel(input.chainId)}</span>
      </div>
      <div className="unavailable-panel pancake-unavailable" role="alert">
        <div>
          <h3>The requested evidence could not be validated.</h3>
          <p>{result.message}</p>
        </div>
        <dl>
          <div>
            <dt>Observed</dt>
            <dd>{observedAt === "Unknown" ? "Unknown" : utc(observedAt)}</dd>
          </div>
          <div>
            <dt>Failure</dt>
            <dd>
              {result.stage.replaceAll("_", " ")} · {result.reason.replaceAll("_", " ")}
            </dd>
          </div>
          <div>
            <dt>Retry</dt>
            <dd>
              {result.retryable
                ? "A fresh read may succeed"
                : "Correct the evidence boundary first"}
            </dd>
          </div>
          <div>
            <dt>Block</dt>
            <dd className="raw-value">{result.blockNumber ?? "Not established"}</dd>
          </div>
          <div>
            <dt>Block hash</dt>
            <dd className="raw-value">Not established</dd>
          </div>
          <div>
            <dt>Fallback</dt>
            <dd>None · no fixture, price, return, or decimals substituted</dd>
          </div>
        </dl>
      </div>
      <SourceLinks input={input} blockNumber={result.blockNumber} />
      <ReadIdentityBoundary />
    </>
  );
}

export default async function PancakePositionPage({ searchParams }: PancakePositionPageProps) {
  const state = await resolvePancakePositionQuery(await searchParams, loadLivePancakePosition);

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
          <span className="nav-current">Pancake position</span>
          <Link className="nav-optional" href="/lp-activate">
            LP configuration
          </Link>
          <Link className="nav-optional" href="/venus-health">
            Venus evidence
          </Link>
          <Link className="nav-optional" href="/yield-sources">
            Lista sources
          </Link>
          <span className="network-pill">Read only</span>
        </div>
      </nav>

      <header className="shell pancake-position-header">
        <span className="eyebrow">PANCAKESWAP V3 · BLOCK-PINNED READ</span>
        <h1>Inspect a position without inventing performance.</h1>
        <p className="lede">
          Supply a BSC network, Pancake V3 pool, and position NFT ID. ProofEra reads the official
          position manager, pool, factory, and block context in one atomic latest Multicall3
          snapshot. It does not estimate price, APR, PnL, or suitability here.
        </p>
      </header>

      <section className="shell pancake-inspector" aria-labelledby="pancake-input-heading">
        <form action="/pancake-position" className="intent-form" method="get">
          <div className="panel-heading">
            <span className="step-number">01</span>
            <div>
              <p className="panel-overline">READ BOUNDARY</p>
              <h2 id="pancake-input-heading">Choose the exact position</h2>
            </div>
          </div>

          <label htmlFor="pancake-chain">BSC network</label>
          <select defaultValue={state.formValues.chainId} id="pancake-chain" name="chainId">
            <option value="56">BSC mainnet · chain 56</option>
            <option value="97">BSC testnet · chain 97</option>
          </select>

          <label htmlFor="pancake-pool">Pancake V3 pool address</label>
          <input
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect="off"
            defaultValue={state.formValues.poolAddress}
            id="pancake-pool"
            maxLength={42}
            name="poolAddress"
            pattern="0x[0-9a-fA-F]{40}"
            placeholder="0x…"
            required
            spellCheck={false}
            type="text"
          />

          <label htmlFor="pancake-position-id">Position NFT ID</label>
          <input
            autoComplete="off"
            defaultValue={state.formValues.positionId}
            id="pancake-position-id"
            inputMode="numeric"
            maxLength={78}
            name="positionId"
            pattern="(0|[1-9][0-9]*)"
            placeholder="Exact decimal uint256"
            required
            type="text"
          />

          <button className="button button-primary" type="submit">
            Read latest position evidence
          </button>
        </form>

        <aside className="intent-readout" aria-label="Read constraints">
          <p className="panel-overline">FIXED BY PROOFERA</p>
          <h2>One-block consistency</h2>
          <dl>
            <div>
              <dt>Authority</dt>
              <dd>Read only · no wallet or signer</dd>
            </div>
            <div>
              <dt>Manager</dt>
              <dd>Official Pancake deployment selected by chain</dd>
            </div>
            <div>
              <dt>RPC</dt>
              <dd>Server configured · never supplied by query</dd>
            </div>
            <div>
              <dt>Claims</dt>
              <dd>Raw onchain state and provenance only</dd>
            </div>
          </dl>
          <div className="decision-hold">
            <strong>No recommendation</strong>
            <p>
              Range state alone does not establish yield, performance, safety, or a rebalance
              decision.
            </p>
          </div>
        </aside>
      </section>

      <section className="shell pancake-result" aria-labelledby="pancake-result-heading">
        {state.status === "blank" ? (
          <div className="empty-panel pancake-query-state" role="status">
            <span className="state-badge state-unknown">No read requested</span>
            <h2 id="pancake-result-heading">Enter a position to begin.</h2>
            <p>No RPC request has been made.</p>
          </div>
        ) : state.status === "invalid" ? (
          <div className="unavailable-panel pancake-query-state" role="alert">
            <div>
              <span className="state-badge state-caution">Input rejected</span>
              <h2 id="pancake-result-heading">Correct the read boundary.</h2>
              <p>No RPC request was made.</p>
            </div>
            <ul>
              {state.issues.map((issue) => (
                <li key={`${issue.field}:${issue.message}`}>
                  <strong>{issue.field}</strong> · {issue.message}
                </li>
              ))}
            </ul>
          </div>
        ) : state.result.status === "available" ? (
          <AvailablePosition input={state.input} result={state.result} />
        ) : (
          <UnavailablePosition input={state.input} result={state.result} />
        )}
      </section>
    </main>
  );
}
