import {
  VENUS_CORE_POOL_BSC_DEPLOYMENTS,
  type VenusHealthAvailableResult
} from "@proofera/integrations";
import type { Metadata } from "next";
import Link from "next/link";

import {
  resolveVenusHealthQuery,
  type VenusHealthFormValues,
  type VenusHealthInput,
  type VenusHealthQueryIssue,
  type VenusHealthSearchParams
} from "../../lib/venus-health-query";
import { loadLiveVenusHealth } from "../../lib/venus-health-rpc";
import type { VenusHealthRouteResult } from "../../lib/venus-health-service";

export const metadata: Metadata = { title: "Venus account liquidity evidence" };
export const dynamic = "force-dynamic";

interface VenusHealthPageProps {
  readonly searchParams: Promise<VenusHealthSearchParams>;
}

const explorerOrigins = {
  56: "https://bscscan.com",
  97: "https://testnet.bscscan.com"
} as const;

const officialDeploymentDocumentationUrl = "https://docs-v4.venus.io/deployed-contracts/markets";
const officialContractDocumentationUrl =
  "https://docs-v4.venus.io/technical-reference/reference-core-pool/comptroller/diamond/facets/policy-facet";

function networkLabel(chainId: 56 | 97): string {
  return chainId === 56 ? "BSC mainnet / chain 56" : "BSC testnet / chain 97";
}

function utc(value: string): string {
  return `${new Date(value).toLocaleString("en-GB", { timeZone: "UTC" })} UTC`;
}

function ExternalLink({ href, children }: Readonly<{ href: string; children: React.ReactNode }>) {
  return (
    <a href={href} rel="noopener noreferrer" target="_blank">
      {children} <span aria-hidden="true">↗</span>
    </a>
  );
}

function HealthFactorBoundary({ result }: Readonly<{ result?: VenusHealthAvailableResult }>) {
  const boundary = result?.snapshot.liquidationThresholdHealthFactor;

  return (
    <aside
      className="venus-health-boundary"
      aria-labelledby="venus-health-factor-heading"
      role="note"
    >
      <p className="panel-overline">CALCULATION BOUNDARY</p>
      <h2 id="venus-health-factor-heading">Health factor: UNKNOWN</h2>
      <p>
        {boundary?.reason ??
          "Venus getAccountLiquidity reports an aggregate excess-or-shortfall difference, not the gross liquidation-threshold-adjusted collateral and debt required for a defensible health-factor ratio."}
      </p>
      <dl>
        <div>
          <dt>Ratio</dt>
          <dd>{boundary === undefined ? "Unknown / not computed" : "null / not computed"}</dd>
        </div>
        <div>
          <dt>Boundary</dt>
          <dd>
            {boundary?.calculationBoundary ?? "aggregate_liquidity_difference_is_not_a_ratio"}
          </dd>
        </div>
        <div>
          <dt>Execution</dt>
          <dd>Disabled; this route performs read-only evidence collection.</dd>
        </div>
        {result === undefined ? null : (
          <div>
            <dt>Methodology</dt>
            <dd>{result.snapshot.methodologyVersion}</dd>
          </div>
        )}
      </dl>
    </aside>
  );
}

function QueryForm({
  values,
  issues = []
}: Readonly<{
  values: VenusHealthFormValues;
  issues?: readonly VenusHealthQueryIssue[];
}>) {
  const chainInvalid = issues.some((issue) => issue.field === "chainId");
  const accountInvalid = issues.some((issue) => issue.field === "account");

  return (
    <form className="intent-form venus-health-form" method="get" action="/venus-health">
      <div className="panel-heading">
        <span className="step-number">01</span>
        <div>
          <p className="panel-overline">READ BOUNDARY</p>
          <h2 id="venus-health-form-heading">Choose one account</h2>
        </div>
      </div>

      <label>
        BSC network
        <select aria-invalid={chainInvalid} defaultValue={values.chainId} name="chainId" required>
          <option value="56">BSC mainnet (56)</option>
          <option value="97">BSC testnet (97)</option>
        </select>
      </label>
      <label>
        Venus account address
        <input
          aria-invalid={accountInvalid}
          autoComplete="off"
          defaultValue={values.account}
          inputMode="text"
          maxLength={42}
          name="account"
          placeholder="0x…"
          required
          spellCheck={false}
        />
      </label>
      <button className="button button-primary" type="submit">
        Read account liquidity
      </button>
      <p className="venus-health-form-note">
        Only the chain and account leave this form. RPC configuration remains server-side.
      </p>
    </form>
  );
}

function QueryState({
  status,
  issues
}: Readonly<{
  status: "blank" | "invalid";
  issues?: readonly VenusHealthQueryIssue[];
}>) {
  if (status === "blank") {
    return (
      <div className="intent-readout pancake-query-state" role="status">
        <p className="panel-overline">NO READ YET</p>
        <h2>Enter an account to begin.</h2>
        <p>
          No RPC request has been made. A valid submission reads the official Venus Core Pool
          Comptroller at one pinned BSC block.
        </p>
        <HealthFactorBoundary />
      </div>
    );
  }

  return (
    <div className="intent-readout pancake-query-state" role="alert">
      <p className="panel-overline">INPUT REJECTED</p>
      <h2>Correct the read boundary.</h2>
      <p>No RPC request was made.</p>
      <ul>
        {issues?.map((issue) => (
          <li key={`${issue.field}:${issue.message}`}>
            <strong>{issue.field}:</strong> {issue.message}
          </li>
        ))}
      </ul>
      <HealthFactorBoundary />
    </div>
  );
}

function SourceLinks({
  input,
  blockNumber,
  deploymentUrl = officialDeploymentDocumentationUrl,
  contractUrl = officialContractDocumentationUrl
}: Readonly<{
  input: VenusHealthInput;
  blockNumber: string | null;
  deploymentUrl?: string;
  contractUrl?: string;
}>) {
  const deployment = VENUS_CORE_POOL_BSC_DEPLOYMENTS[input.chainId];
  const explorer = explorerOrigins[input.chainId];

  return (
    <div className="pancake-source-links" aria-label="Venus evidence source links">
      {blockNumber === null ? null : (
        <ExternalLink href={`${explorer}/block/${blockNumber}`}>Pinned block</ExternalLink>
      )}
      <ExternalLink href={`${explorer}/address/${input.account}`}>Account</ExternalLink>
      <ExternalLink href={deployment.explorerUrl}>Official Comptroller</ExternalLink>
      <ExternalLink href={deploymentUrl}>Official deployments</ExternalLink>
      <ExternalLink href={contractUrl}>Contract method</ExternalLink>
    </div>
  );
}

function AvailableEvidence({
  input,
  result
}: Readonly<{ input: VenusHealthInput; result: VenusHealthAvailableResult }>) {
  const liquidity = result.snapshot.liquidationThresholdLiquidity;
  const { provenance } = result;

  return (
    <>
      <div className="pancake-result-heading">
        <div>
          <span className="state-badge state-live">Read available</span>
          <h2 id="venus-result-heading">Raw Venus evidence at one block</h2>
        </div>
        <span
          className={input.chainId === 97 ? "state-badge state-caution" : "state-badge state-live"}
        >
          {networkLabel(input.chainId)}
        </span>
      </div>

      <HealthFactorBoundary result={result} />

      <div className="pancake-evidence-grid venus-health-evidence-grid">
        <article className="passport-panel">
          <div className="passport-panel-heading">
            <div>
              <span className="step-number">02</span>
              <h2>Raw contract result</h2>
            </div>
            <span className="state-badge state-live">Validated</span>
          </div>
          <dl className="pancake-facts">
            <div>
              <dt>Error code / raw uint256</dt>
              <dd className="raw-value">{liquidity.errorCode}</dd>
            </div>
            <div>
              <dt>Excess liquidity / raw</dt>
              <dd className="raw-value">{liquidity.excessLiquidityRaw}</dd>
            </div>
            <div>
              <dt>Shortfall / raw</dt>
              <dd className="raw-value">{liquidity.shortfallRaw}</dd>
            </div>
            <div>
              <dt>Raw unit boundary</dt>
              <dd>{liquidity.rawUnit}</dd>
            </div>
            <div>
              <dt>HTTP fallback</dt>
              <dd>{provenance.httpFallbackUsed ? "Used" : "Not used"}</dd>
            </div>
            <div>
              <dt>Function</dt>
              <dd className="raw-value">{provenance.source.functionSignature}</dd>
            </div>
          </dl>
        </article>

        <article className="passport-panel">
          <div className="passport-panel-heading">
            <div>
              <span className="step-number">03</span>
              <h2>Block provenance</h2>
            </div>
            <span className="state-badge state-live">Hash pinned</span>
          </div>
          <dl className="pancake-facts">
            <div>
              <dt>Environment</dt>
              <dd>{provenance.environment}</dd>
            </div>
            <div>
              <dt>Account</dt>
              <dd className="raw-value">{provenance.account}</dd>
            </div>
            <div>
              <dt>Comptroller</dt>
              <dd className="raw-value">{provenance.source.contractAddress}</dd>
            </div>
            <div>
              <dt>Observed</dt>
              <dd>{utc(provenance.observedAt)}</dd>
            </div>
            <div>
              <dt>Block time</dt>
              <dd>{utc(provenance.block.timestampUtc)}</dd>
            </div>
            <div>
              <dt>Block number</dt>
              <dd className="raw-value">{provenance.block.number}</dd>
            </div>
            <div>
              <dt>Block hash</dt>
              <dd className="raw-value">{provenance.block.hash}</dd>
            </div>
            <div>
              <dt>Block age at observation</dt>
              <dd>{provenance.ageSeconds} seconds</dd>
            </div>
          </dl>
          <SourceLinks
            input={input}
            blockNumber={provenance.block.number}
            deploymentUrl={provenance.source.officialDeploymentDocumentationUrl}
            contractUrl={provenance.source.officialContractDocumentationUrl}
          />
        </article>
      </div>

      <aside className="venus-health-limitations" aria-labelledby="venus-limitations-heading">
        <h2 id="venus-limitations-heading">What this read does not establish</h2>
        <ul>
          {result.snapshot.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
      </aside>
    </>
  );
}

function unavailableObservedAt(
  result: Extract<VenusHealthRouteResult, { readonly status: "unavailable" }>
): string {
  if ("observedAt" in result) return result.observedAt;
  return result.provenance?.observedAt ?? "Unknown";
}

function UnavailableEvidence({
  input,
  result
}: Readonly<{
  input: VenusHealthInput;
  result: Extract<VenusHealthRouteResult, { readonly status: "unavailable" }>;
}>) {
  const deployment = VENUS_CORE_POOL_BSC_DEPLOYMENTS[input.chainId];
  const observedAt = unavailableObservedAt(result);
  const block = result.provenance?.block ?? null;

  return (
    <>
      <div className="pancake-result-heading">
        <div>
          <span className="state-badge state-caution">Read unavailable</span>
          <h2 id="venus-result-heading">No account snapshot was established</h2>
        </div>
        <span className="state-badge state-unknown">{networkLabel(input.chainId)}</span>
      </div>

      <HealthFactorBoundary />

      <div className="unavailable-panel pancake-unavailable" role="alert">
        <div>
          <h3>The requested evidence could not be validated.</h3>
          <p>{result.message}</p>
        </div>
        <dl>
          <div>
            <dt>Failure</dt>
            <dd>
              {result.stage.replaceAll("_", " ")} / {result.reason.replaceAll("_", " ")}
            </dd>
          </div>
          <div>
            <dt>Error code / raw</dt>
            <dd className="raw-value">
              {result.contractErrorCode ?? "Unknown / no validated contract result"}
            </dd>
          </div>
          <div>
            <dt>Excess liquidity / raw</dt>
            <dd>Unknown / unavailable</dd>
          </div>
          <div>
            <dt>Shortfall / raw</dt>
            <dd>Unknown / unavailable</dd>
          </div>
          <div>
            <dt>Observed</dt>
            <dd>{observedAt === "Unknown" ? observedAt : utc(observedAt)}</dd>
          </div>
          <div>
            <dt>Environment</dt>
            <dd>{deployment.environment}</dd>
          </div>
          <div>
            <dt>Block number</dt>
            <dd className="raw-value">{block?.number ?? "Unknown / not established"}</dd>
          </div>
          <div>
            <dt>Block hash</dt>
            <dd className="raw-value">{block?.hash ?? "Unknown / not established"}</dd>
          </div>
          <div>
            <dt>Retry</dt>
            <dd>
              {result.retryable ? "A fresh read may be attempted." : "Review the failure first."}
            </dd>
          </div>
        </dl>
      </div>
      <SourceLinks input={input} blockNumber={block?.number ?? null} />
    </>
  );
}

export default async function VenusHealthPage({ searchParams }: VenusHealthPageProps) {
  const state = await resolveVenusHealthQuery(await searchParams, loadLiveVenusHealth);

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
          <Link className="nav-optional" href="/pancake-position">
            Pancake position
          </Link>
          <Link className="nav-optional" href="/yield-sources">
            Lista sources
          </Link>
          <span className="nav-current">Venus evidence</span>
          <span className="network-pill">Read only</span>
        </div>
      </nav>

      <header className="shell pancake-position-header venus-health-header">
        <span className="eyebrow">VENUS CORE POOL / BLOCK-PINNED READ</span>
        <h1>Inspect liquidity without inventing a health factor.</h1>
        <p className="lede">
          Read the official Comptroller on BSC mainnet or testnet. ProofEra preserves raw values,
          one block identity, and the boundary between account liquidity and an unsupported ratio.
        </p>
      </header>

      <section
        className="shell pancake-inspector venus-health-inspector"
        aria-labelledby="venus-health-form-heading"
      >
        <QueryForm
          values={state.formValues}
          issues={state.status === "invalid" ? state.issues : []}
        />
        {state.status === "blank" || state.status === "invalid" ? (
          <QueryState
            status={state.status}
            {...(state.status === "invalid" ? { issues: state.issues } : {})}
          />
        ) : (
          <aside className="intent-readout" aria-label="Read request">
            <p className="panel-overline">VALIDATED REQUEST</p>
            <h2>{networkLabel(state.input.chainId)}</h2>
            <dl>
              <div>
                <dt>Account</dt>
                <dd className="raw-value">{state.input.account}</dd>
              </div>
              <div>
                <dt>Contract</dt>
                <dd className="raw-value">
                  {VENUS_CORE_POOL_BSC_DEPLOYMENTS[state.input.chainId].comptroller}
                </dd>
              </div>
              <div>
                <dt>Authority</dt>
                <dd>Read only / no wallet / no transaction</dd>
              </div>
            </dl>
          </aside>
        )}
      </section>

      {state.status !== "loaded" ? null : (
        <section className="shell pancake-result" aria-labelledby="venus-result-heading">
          {state.result.status === "available" ? (
            <AvailableEvidence input={state.input} result={state.result} />
          ) : (
            <UnavailableEvidence input={state.input} result={state.result} />
          )}
        </section>
      )}
    </main>
  );
}
