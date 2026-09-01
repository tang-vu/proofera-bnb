import type { Metadata } from "next";
import type { ReactNode } from "react";

import { loadLiveListaYieldSources } from "../../lib/lista-yield-live";
import {
  LISTA_YIELD_OFFICIAL_LINKS,
  LISTA_YIELD_UNKNOWN_BOUNDARY_COPY,
  createListaYieldSourcesView,
  type ListaYieldProvenanceView,
  type ListaYieldSourceView,
  type ListaYieldUnavailableView
} from "../../lib/lista-yield-view-model";

export const metadata: Metadata = { title: "Lista yield-source evidence" };
export const dynamic = "force-dynamic";

function ExternalLink({ href, children }: Readonly<{ href: string; children: ReactNode }>) {
  return (
    <a href={href} rel="noopener noreferrer" target="_blank">
      {children} <span aria-hidden="true">↗</span>
    </a>
  );
}

function OfficialLinks() {
  return (
    <div className="pancake-source-links" aria-label="Official Lista source links">
      <ExternalLink href={LISTA_YIELD_OFFICIAL_LINKS.source}>Official API request</ExternalLink>
      <ExternalLink href={LISTA_YIELD_OFFICIAL_LINKS.documentation}>
        Lista vault API documentation
      </ExternalLink>
      <ExternalLink href={LISTA_YIELD_OFFICIAL_LINKS.sdkRepository}>
        Official lending SDK
      </ExternalLink>
      <ExternalLink href={LISTA_YIELD_OFFICIAL_LINKS.sdkClient}>SDK API client source</ExternalLink>
    </div>
  );
}

function UnknownBoundary({ observedAt }: Readonly<{ observedAt: string | null }>) {
  return (
    <aside className="venus-health-boundary" aria-labelledby="lista-boundary-heading" role="note">
      <p className="panel-overline">INTERPRETATION BOUNDARY</p>
      <h2 id="lista-boundary-heading">APY scale: UNKNOWN</h2>
      <p>{LISTA_YIELD_UNKNOWN_BOUNDARY_COPY.apyScale}</p>
      <dl>
        <div>
          <dt>Net APY</dt>
          <dd>{LISTA_YIELD_UNKNOWN_BOUNDARY_COPY.netApy}</dd>
        </div>
        <div>
          <dt>Withdrawable liquidity</dt>
          <dd>{LISTA_YIELD_UNKNOWN_BOUNDARY_COPY.withdrawableLiquidity}</dd>
        </div>
        <div>
          <dt>Fee meaning</dt>
          <dd>{LISTA_YIELD_UNKNOWN_BOUNDARY_COPY.feeMeaning}</dd>
        </div>
        <div>
          <dt>Withdrawal constraints</dt>
          <dd>{LISTA_YIELD_UNKNOWN_BOUNDARY_COPY.withdrawalConstraints}</dd>
        </div>
        <div>
          <dt>Item freshness</dt>
          <dd>
            UNKNOWN — the endpoint supplies no per-item timestamp.
            {observedAt === null
              ? " No retrieval time was established."
              : ` ${observedAt} is retrieval time, not vault freshness.`}
          </dd>
        </div>
        <div>
          <dt>Realized performance</dt>
          <dd>{LISTA_YIELD_UNKNOWN_BOUNDARY_COPY.realizedPerformance}</dd>
        </div>
        <div>
          <dt>Risk</dt>
          <dd>{LISTA_YIELD_UNKNOWN_BOUNDARY_COPY.risk}</dd>
        </div>
        <div>
          <dt>Execution</dt>
          <dd>Disabled — this route reads evidence and cannot activate or transact.</dd>
        </div>
      </dl>
    </aside>
  );
}

function ProvenancePanel({ provenance }: Readonly<{ provenance: ListaYieldProvenanceView }>) {
  return (
    <article className="passport-panel">
      <div className="passport-panel-heading">
        <div>
          <span className="step-number">01</span>
          <h2>Request provenance</h2>
        </div>
        <span className="state-badge state-live">Validated</span>
      </div>
      <dl className="pancake-facts">
        <div>
          <dt>Network</dt>
          <dd>BSC mainnet / chain 56</dd>
        </div>
        <div>
          <dt>Endpoint</dt>
          <dd>{provenance.endpoint}</dd>
        </div>
        <div>
          <dt>Observed / retrieval time</dt>
          <dd className="raw-value">{provenance.observedAt}</dd>
        </div>
        <div>
          <dt>HTTP date</dt>
          <dd className="raw-value">{provenance.httpDateUtc ?? "Not supplied"}</dd>
        </div>
        <div>
          <dt>Source timestamp / raw</dt>
          <dd className="raw-value">
            {provenance.sourceTimestampRaw ?? "Not supplied"} / {provenance.sourceTimestampUnit}
          </dd>
        </div>
        <div>
          <dt>Item freshness</dt>
          <dd>Unknown / no per-item timestamp</dd>
        </div>
        <div>
          <dt>Source total</dt>
          <dd className="raw-value">{provenance.total}</dd>
        </div>
        <div>
          <dt>Bounded page</dt>
          <dd className="raw-value">
            {provenance.page} / {provenance.pageSize} records maximum
          </dd>
        </div>
        <div>
          <dt>Methodology</dt>
          <dd className="raw-value">{provenance.methodologyVersion}</dd>
        </div>
        <div>
          <dt>Execution</dt>
          <dd>Disabled</dd>
        </div>
      </dl>
      <p className="registry-footnote">{provenance.sourceOrderDisclosure}</p>
      <OfficialLinks />
    </article>
  );
}

function UnknownEvidence({ source }: Readonly<{ source: ListaYieldSourceView }>) {
  const fields = [
    ["APY scale", source.unknowns.apyScale],
    ["Net APY", source.unknowns.netApy],
    ["Withdrawable liquidity", source.unknowns.withdrawableLiquidity],
    ["Fee meaning", source.unknowns.feeMeaning],
    ["Withdrawal constraints", source.unknowns.withdrawalConstraints],
    ["Item freshness", source.unknowns.itemFreshness],
    ["Realized performance", source.unknowns.realizedPerformance],
    ["Risk", source.unknowns.risk]
  ] as const;

  return (
    <dl className="unknown-evidence-list">
      {fields.map(([label, value]) => (
        <div className="unknown-evidence-row" key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function YieldSourceCard({ source }: Readonly<{ source: ListaYieldSourceView }>) {
  const headingId = `lista-source-${source.vaultAddress.slice(2).toLowerCase()}`;
  const displayedMarkets = source.collateralMarkets.slice(0, 8);
  return (
    <article className="passport-panel" aria-labelledby={headingId}>
      <div className="passport-panel-heading">
        <div>
          <span className="step-number">SRC</span>
          <h2 id={headingId}>{source.name}</h2>
        </div>
        <span className="state-badge state-unknown">Unscored</span>
      </div>

      <p className="mono-kicker">
        {source.asset.symbol} · source metadata rendered as text · no remote icon
      </p>
      <dl className="pancake-facts">
        <div>
          <dt>Vault / raw address</dt>
          <dd className="raw-value">{source.vaultAddress}</dd>
        </div>
        <div>
          <dt>Asset / raw address</dt>
          <dd className="raw-value">
            {source.asset.symbol} / {source.asset.address}
          </dd>
        </div>
        <div>
          <dt>Source display decimals</dt>
          <dd className="raw-value">{source.asset.displayDecimals}</dd>
        </div>
        <div>
          <dt>Curator / source text</dt>
          <dd>{source.curator.length === 0 ? "Not supplied" : source.curator}</dd>
        </div>
        <div>
          <dt>APY / raw decimal</dt>
          <dd className="raw-value">{source.raw.apy}</dd>
        </div>
        <div>
          <dt>Emission APY / raw decimal</dt>
          <dd className="raw-value">{source.raw.emissionApy ?? "Not supplied"}</dd>
        </div>
        <div>
          <dt>Emissions enabled</dt>
          <dd>
            {source.raw.emissionEnabled ? "Source reports enabled" : "Source reports disabled"}
          </dd>
        </div>
        <div>
          <dt>Deposits / raw decimal</dt>
          <dd className="raw-value">{source.raw.deposits}</dd>
        </div>
        <div>
          <dt>Deposits USD / raw decimal</dt>
          <dd className="raw-value">{source.raw.depositsUsd}</dd>
        </div>
        <div>
          <dt>Utilization / raw decimal</dt>
          <dd className="raw-value">{source.raw.utilization}</dd>
        </div>
        <div>
          <dt>Fee / raw decimal</dt>
          <dd className="raw-value">{source.raw.fee ?? "Not supplied"}</dd>
        </div>
        <div>
          <dt>Collateral market records</dt>
          <dd className="raw-value">{source.collateralMarkets.length}</dd>
        </div>
        {source.rewards.length === 0 ? (
          <div>
            <dt>Emission detail</dt>
            <dd>Not supplied</dd>
          </div>
        ) : (
          source.rewards.map((reward) => (
            <div key={reward.name}>
              <dt>{reward.name} emission / raw</dt>
              <dd className="raw-value">
                APY {reward.apy} · total {reward.total}
              </dd>
            </div>
          ))
        )}
      </dl>

      <p className="panel-overline">UNKNOWN / NOT COMPUTED</p>
      <UnknownEvidence source={source} />

      <div
        className="pancake-source-links"
        aria-label={`Lista vault and market evidence for ${source.name}`}
      >
        <ExternalLink href={source.vaultExplorerUrl}>Vault on BscScan</ExternalLink>
        <ExternalLink href={source.asset.explorerUrl}>Asset on BscScan</ExternalLink>
        {displayedMarkets.map((market) => (
          <span className="raw-value" key={market.id}>
            Market: {market.name} / ID {market.id} / loan {market.loanSymbol ?? "not supplied"} /
            allocation {market.allocation ?? "not supplied"}
            {market.explorerUrl === null ? null : (
              <>
                {" / "}
                <ExternalLink href={market.explorerUrl}>BscScan</ExternalLink>
              </>
            )}
          </span>
        ))}
        {displayedMarkets.length < source.collateralMarkets.length ? (
          <span>
            Showing the first {displayedMarkets.length} of {source.collateralMarkets.length}
            source-ordered market records.
          </span>
        ) : null}
      </div>
    </article>
  );
}

function AvailableSources({
  view
}: Readonly<{
  view: Extract<ReturnType<typeof createListaYieldSourcesView>, { status: "available" }>;
}>) {
  return (
    <>
      <div className="pancake-result-heading">
        <div>
          <span className="state-badge state-live">Source available</span>
          <h2 id="lista-result-heading">Raw Lista vault-list records</h2>
        </div>
        <span className="state-badge state-live">BSC mainnet / chain 56</span>
      </div>

      <UnknownBoundary observedAt={view.provenance.observedAt} />

      <div className="source-status" role="status">
        <div>
          <span aria-hidden="true" className="status-dot" />
          Official API answered
        </div>
        <span>
          Showing {view.sources.length} bounded first-page record
          {view.sources.length === 1 ? "" : "s"}; source total {view.provenance.total}
        </span>
      </div>

      <div className="pancake-evidence-grid">
        <ProvenancePanel provenance={view.provenance} />
        <article className="passport-panel">
          <div className="passport-panel-heading">
            <div>
              <span className="step-number">02</span>
              <h2>What this page establishes</h2>
            </div>
            <span className="state-badge state-caution">Read only</span>
          </div>
          <dl className="pancake-facts">
            <div>
              <dt>Established</dt>
              <dd>Validated source-reported raw fields from one bounded Lista API response.</dd>
            </div>
            <div>
              <dt>Not established</dt>
              <dd>Scale, net yield, exit liquidity, constraints, realized outcomes, or risk.</dd>
            </div>
            <div>
              <dt>Scoring</dt>
              <dd>None; source order is preserved without ProofEra endorsement.</dd>
            </div>
            <div>
              <dt>Action</dt>
              <dd>No wallet, approval, deposit, withdrawal, or transaction path exists here.</dd>
            </div>
          </dl>
        </article>
      </div>

      <div className="passport-grid" aria-label="Lista source-reported vault records">
        {view.sources.map((source) => (
          <YieldSourceCard key={source.key} source={source} />
        ))}
      </div>
    </>
  );
}

function EmptySources({
  view
}: Readonly<{
  view: Extract<ReturnType<typeof createListaYieldSourcesView>, { status: "empty" }>;
}>) {
  return (
    <>
      <div className="pancake-result-heading">
        <div>
          <span className="state-badge state-unknown">Source empty</span>
          <h2 id="lista-result-heading">No vault records on the bounded page</h2>
        </div>
        <span className="state-badge state-live">BSC mainnet / chain 56</span>
      </div>
      <UnknownBoundary observedAt={view.provenance.observedAt} />
      <div className="empty-panel" role="status">
        <p className="panel-overline">AUTHORITATIVE EMPTY RESPONSE</p>
        <h3>Lista returned zero source records.</h3>
        <p>{view.message}</p>
      </div>
      <div className="pancake-evidence-grid">
        <ProvenancePanel provenance={view.provenance} />
      </div>
    </>
  );
}

function UnavailableSources({ view }: Readonly<{ view: ListaYieldUnavailableView }>) {
  return (
    <>
      <div className="pancake-result-heading">
        <div>
          <span className="state-badge state-caution">Source unavailable</span>
          <h2 id="lista-result-heading">No Lista source snapshot was established</h2>
        </div>
        <span className="state-badge state-unknown">BSC mainnet / chain 56</span>
      </div>
      <UnknownBoundary observedAt={view.observedAt} />
      <div className="unavailable-panel pancake-unavailable" role="alert">
        <div>
          <p className="panel-overline">NO FALLBACK APPLIED</p>
          <h3>The official source could not be validated.</h3>
          <p>{view.message}</p>
        </div>
        <dl>
          <div>
            <dt>Failure</dt>
            <dd>
              {view.stage.replaceAll("_", " ")} / {view.reason.replaceAll("_", " ")}
            </dd>
          </div>
          <div>
            <dt>HTTP status</dt>
            <dd className="raw-value">{view.httpStatus ?? "Not established"}</dd>
          </div>
          <div>
            <dt>Observed</dt>
            <dd className="raw-value">{view.observedAt ?? "Not established"}</dd>
          </div>
          <div>
            <dt>Retry</dt>
            <dd>
              {view.retryable ? "A fresh read may be attempted." : "Review the failure first."}
            </dd>
          </div>
          <div>
            <dt>Vault records</dt>
            <dd>Unavailable — not interpreted as zero.</dd>
          </div>
          <div>
            <dt>Execution</dt>
            <dd>Disabled</dd>
          </div>
        </dl>
      </div>
      <OfficialLinks />
    </>
  );
}

export default async function YieldSourcesPage() {
  const view = createListaYieldSourcesView(await loadLiveListaYieldSources());

  return (
    <main id="main-content" tabIndex={-1}>
      <header className="shell pancake-position-header">
        <span className="eyebrow">LISTA MOOLAH / OFFICIAL API READ</span>
        <h1>Inspect yield-source fields without inventing net yield.</h1>
        <p className="lede">
          ProofEra reads one bounded BSC-mainnet page from Lista, preserves source decimals, and
          separates reported vault fields from the decisions this endpoint cannot support.
        </p>
      </header>

      <section className="shell pancake-result" aria-labelledby="lista-result-heading">
        {view.status === "available" ? (
          <AvailableSources view={view} />
        ) : view.status === "empty" ? (
          <EmptySources view={view} />
        ) : (
          <UnavailableSources view={view} />
        )}
      </section>
    </main>
  );
}
