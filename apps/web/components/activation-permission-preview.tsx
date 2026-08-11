import type { ActivationPermissionPreview, PermissionPreviewEnforcement } from "@proofera/domain";
import type { ReactNode } from "react";

type CallRow = ActivationPermissionPreview["callRows"][number];
type CapitalRow = ActivationPermissionPreview["capitalRows"][number];
type SpendCapRow = ActivationPermissionPreview["spendCapRows"][number];
type ConstraintRow = ActivationPermissionPreview["constraintRows"][number];
type PlainText = ActivationPermissionPreview["overviewRows"]["agent"]["agent"];

interface TokenMetadataView {
  readonly decimals: number | null;
  readonly metadataStatus: "known" | "missing" | "ambiguous";
  readonly symbol: PlainText | null;
  readonly tokenAddress: string;
}

function EnforcementOwner({ owner }: Readonly<{ owner: PermissionPreviewEnforcement }>) {
  return (
    <span className="state-badge state-unknown" data-enforcement-owner={owner}>
      {owner}
    </span>
  );
}

function WorstCase({ text }: Readonly<{ text: string }>) {
  return <p className="permission-preview-row-worst-case">{text}</p>;
}

function PlainTextValue({ value }: Readonly<{ value: PlainText }>) {
  return <>{value.text}</>;
}

function UnknownMetadata({
  field,
  status
}: Readonly<{
  field: "symbol" | "decimals";
  status: TokenMetadataView["metadataStatus"];
}>) {
  return (
    <span data-metadata-status={status}>
      Unknown — {field} not supplied (metadata status: {status})
    </span>
  );
}

function TokenMetadata({ metadata }: Readonly<{ metadata: TokenMetadataView }>) {
  return (
    <dl className="permission-preview-token-metadata">
      <div>
        <dt>Token address</dt>
        <dd className="raw-value">{metadata.tokenAddress}</dd>
      </div>
      <div>
        <dt>Symbol</dt>
        <dd>
          {metadata.symbol === null ? (
            <UnknownMetadata field="symbol" status={metadata.metadataStatus} />
          ) : (
            <PlainTextValue value={metadata.symbol} />
          )}
        </dd>
      </div>
      <div>
        <dt>Decimals</dt>
        <dd>
          {metadata.decimals === null ? (
            <UnknownMetadata field="decimals" status={metadata.metadataStatus} />
          ) : (
            metadata.decimals
          )}
        </dd>
      </div>
      <div>
        <dt>Metadata status</dt>
        <dd>{metadata.metadataStatus}</dd>
      </div>
    </dl>
  );
}

function OverviewEntry({
  enforcement,
  label,
  value,
  worstCase
}: Readonly<{
  enforcement: PermissionPreviewEnforcement;
  label: string;
  value: ReactNode;
  worstCase: string;
}>) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        <div>{value}</div>
        <EnforcementOwner owner={enforcement} />
        <WorstCase text={worstCase} />
      </dd>
    </div>
  );
}

function Overview({ preview }: Readonly<{ preview: ActivationPermissionPreview }>) {
  const { agent, expiry, network, policyBinding, wallet } = preview.overviewRows;

  return (
    <section className="passport-panel" aria-labelledby="permission-preview-overview-heading">
      <div className="passport-panel-heading">
        <div>
          <span className="step-number">01</span>
          <h3 id="permission-preview-overview-heading">Identity and authority</h3>
        </div>
      </div>
      <dl className="passport-facts permission-preview-overview">
        <OverviewEntry
          enforcement={network.enforcement}
          label={network.label}
          value={
            <>
              {network.name} · chain {network.chainId} · {network.environment}
            </>
          }
          worstCase={network.worstCase}
        />
        <OverviewEntry
          enforcement={agent.enforcement}
          label={agent.label}
          value={<PlainTextValue value={agent.agent} />}
          worstCase={agent.worstCase}
        />
        <OverviewEntry
          enforcement={wallet.enforcement}
          label={wallet.label}
          value={<span className="raw-value">{wallet.address}</span>}
          worstCase={wallet.worstCase}
        />
        <OverviewEntry
          enforcement={expiry.enforcement}
          label={expiry.label}
          value={
            <dl>
              <div>
                <dt>Unix seconds</dt>
                <dd className="raw-value">{expiry.expiryUnixSeconds}</dd>
              </div>
              <div>
                <dt>UTC</dt>
                <dd>{expiry.expiryUtc ?? "Unknown — expiry cannot be represented as UTC"}</dd>
              </div>
            </dl>
          }
          worstCase={expiry.worstCase}
        />
        <OverviewEntry
          enforcement={policyBinding.enforcement}
          label={policyBinding.label}
          value={
            <dl>
              <div>
                <dt>Policy hash</dt>
                <dd className="raw-value">{policyBinding.policyHash}</dd>
              </div>
              <div>
                <dt>Policy version</dt>
                <dd>{policyBinding.policyVersion}</dd>
              </div>
              <div>
                <dt>Preview schema</dt>
                <dd>{preview.schemaVersion}</dd>
              </div>
            </dl>
          }
          worstCase={policyBinding.worstCase}
        />
      </dl>
    </section>
  );
}

function ExpectedIdentity({ identity }: Readonly<{ identity: CallRow["expectedIdentity"] }>) {
  return (
    <div className="permission-preview-identity">
      {identity.kind === "code_hash" ? (
        <dl>
          <div>
            <dt>Identity kind</dt>
            <dd>code_hash</dd>
          </div>
          <div>
            <dt>Expected code hash</dt>
            <dd className="raw-value">{identity.codeHash}</dd>
          </div>
        </dl>
      ) : (
        <dl>
          <div>
            <dt>Identity kind</dt>
            <dd>implementation</dd>
          </div>
          <div>
            <dt>Expected implementation</dt>
            <dd className="raw-value">{identity.implementationAddress}</dd>
          </div>
          <div>
            <dt>Expected implementation code hash</dt>
            <dd className="raw-value">{identity.implementationCodeHash}</dd>
          </div>
        </dl>
      )}
      <EnforcementOwner owner={identity.enforcement} />
      <WorstCase text={identity.worstCase} />
    </div>
  );
}

function Calls({ rows }: Readonly<{ rows: readonly CallRow[] }>) {
  return (
    <section className="passport-panel" aria-labelledby="permission-preview-calls-heading">
      <div className="passport-panel-heading">
        <div>
          <span className="step-number">02</span>
          <h3 id="permission-preview-calls-heading">Allowed contract calls</h3>
        </div>
      </div>
      <div
        className="comparison-table-scroll"
        aria-label="Allowed target, selector, and signature pairs"
        tabIndex={0}
      >
        <table className="comparison-table permission-preview-table">
          <caption>Each selector and signature remains paired with its target contract.</caption>
          <thead>
            <tr>
              <th scope="col">Contract and function pair</th>
              <th scope="col">Expected code identity</th>
              <th scope="col">Enforcement and worst case</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.rowId} data-call-row={row.rowId}>
                <th scope="row">
                  <PlainTextValue value={row.contractLabel} />
                  <dl>
                    <div>
                      <dt>Target</dt>
                      <dd className="raw-value">{row.contractAddress}</dd>
                    </div>
                    <div>
                      <dt>Selector</dt>
                      <dd className="raw-value">{row.selector}</dd>
                    </div>
                    <div>
                      <dt>Signature</dt>
                      <dd className="raw-value">{row.signature}</dd>
                    </div>
                    <div>
                      <dt>Operation</dt>
                      <dd>{row.operationKind}</dd>
                    </div>
                  </dl>
                </th>
                <td>
                  <ExpectedIdentity identity={row.expectedIdentity} />
                </td>
                <td>
                  <EnforcementOwner owner={row.enforcement} />
                  <WorstCase text={row.worstCase} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Capital({ rows }: Readonly<{ rows: readonly CapitalRow[] }>) {
  return (
    <section className="passport-panel" aria-labelledby="permission-preview-capital-heading">
      <div className="passport-panel-heading">
        <div>
          <span className="step-number">03</span>
          <h3 id="permission-preview-capital-heading">Configured capital</h3>
        </div>
      </div>
      <div className="comparison-table-scroll" aria-label="Configured capital" tabIndex={0}>
        <table className="comparison-table permission-preview-table">
          <caption>Exact raw capital amounts; no price or valuation is inferred.</caption>
          <thead>
            <tr>
              <th scope="col">Token</th>
              <th scope="col">Raw amount and decimals</th>
              <th scope="col">Enforcement and worst case</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.rowId} data-capital-row={row.rowId}>
                <th scope="row">
                  <PlainTextValue value={row.symbol} />
                  <div className="raw-value">{row.tokenAddress}</div>
                </th>
                <td>
                  <dl>
                    <div>
                      <dt>Amount / raw units</dt>
                      <dd className="raw-value">{row.amountRaw}</dd>
                    </div>
                    <div>
                      <dt>Decimals</dt>
                      <dd>{row.decimals}</dd>
                    </div>
                    <div>
                      <dt>Period</dt>
                      <dd>
                        {row.period === null
                          ? "None — configured capital is not periodic"
                          : row.period}
                      </dd>
                    </div>
                  </dl>
                </td>
                <td>
                  <EnforcementOwner owner={row.enforcement} />
                  <WorstCase text={row.worstCase} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SpendCaps({ rows }: Readonly<{ rows: readonly SpendCapRow[] }>) {
  return (
    <section className="passport-panel" aria-labelledby="permission-preview-spend-heading">
      <div className="passport-panel-heading">
        <div>
          <span className="step-number">04</span>
          <h3 id="permission-preview-spend-heading">Token spend caps</h3>
        </div>
      </div>
      <div className="comparison-table-scroll" aria-label="Token spend caps" tabIndex={0}>
        <table className="comparison-table permission-preview-table">
          <caption>Exact raw-unit cap for each token and enforcement period.</caption>
          <thead>
            <tr>
              <th scope="col">Token metadata</th>
              <th scope="col">Raw cap and period</th>
              <th scope="col">Enforcement and worst case</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.rowId} data-spend-row={row.rowId}>
                <th scope="row">
                  <TokenMetadata metadata={row} />
                </th>
                <td>
                  <dl>
                    <div>
                      <dt>Limit / raw units</dt>
                      <dd className="raw-value">{row.limitRaw}</dd>
                    </div>
                    <div>
                      <dt>Period</dt>
                      <dd>{row.period}</dd>
                    </div>
                  </dl>
                </td>
                <td>
                  <EnforcementOwner owner={row.enforcement} />
                  <WorstCase text={row.worstCase} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MinimumAmounts({
  amounts
}: Readonly<{
  amounts: Extract<ConstraintRow, { readonly kind: "minimum_amounts" }>["amounts"];
}>) {
  return (
    <ul className="permission-preview-minimums">
      {amounts.map((amount, index) => (
        <li key={`${amount.tokenAddress}:${index}`}>
          <TokenMetadata metadata={amount} />
          <dl>
            <div>
              <dt>Minimum / raw units</dt>
              <dd className="raw-value">{amount.amountRaw}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}

function ConstraintValue({ row }: Readonly<{ row: ConstraintRow }>) {
  switch (row.kind) {
    case "recipient":
      return <span className="raw-value">{row.address}</span>;
    case "token_id":
      return <span className="raw-value">{row.tokenIdRaw}</span>;
    case "tick_range":
      return (
        <dl>
          <div>
            <dt>Lower tick</dt>
            <dd>{row.lower}</dd>
          </div>
          <div>
            <dt>Upper tick</dt>
            <dd>{row.upper}</dd>
          </div>
        </dl>
      );
    case "minimum_amounts":
      return <MinimumAmounts amounts={row.amounts} />;
    case "slippage":
      return (
        <dl>
          <div>
            <dt>Maximum / basis points</dt>
            <dd>{row.slippageBps}</dd>
          </div>
        </dl>
      );
    case "quote_age":
      return (
        <dl>
          <div>
            <dt>Observed at</dt>
            <dd>{row.observedAt}</dd>
          </div>
          <div>
            <dt>Valid until</dt>
            <dd>{row.validUntil}</dd>
          </div>
          <div>
            <dt>Validity window / milliseconds</dt>
            <dd>{row.validityWindowMilliseconds}</dd>
          </div>
          <div>
            <dt>Age at preview</dt>
            <dd>
              {row.ageAtPreviewMilliseconds === null
                ? "Unknown — ProofEra runtime must recompute age"
                : row.ageAtPreviewMilliseconds}
            </dd>
          </div>
          <div>
            <dt>Source URL / text only</dt>
            <dd className="raw-value">{row.sourceUrl}</dd>
          </div>
        </dl>
      );
    case "deadline":
      return (
        <dl>
          <div>
            <dt>Relative deadline / seconds</dt>
            <dd>{row.deadlineSeconds}</dd>
          </div>
          <div>
            <dt>Transaction deadline / Unix seconds</dt>
            <dd>{row.transactionDeadlineUnixSeconds}</dd>
          </div>
          <div>
            <dt>Transaction deadline / UTC</dt>
            <dd>
              {row.transactionDeadlineUtc ??
                "Unknown — transaction deadline cannot be represented as UTC"}
            </dd>
          </div>
        </dl>
      );
    case "max_executions":
      return (
        <dl>
          <div>
            <dt>Maximum executions</dt>
            <dd>{row.maxExecutionsPerDay}</dd>
          </div>
          <div>
            <dt>Period</dt>
            <dd>{row.period}</dd>
          </div>
        </dl>
      );
    case "emergency":
      return (
        <dl>
          <div>
            <dt>On deviation</dt>
            <dd>{row.onDeviation}</dd>
          </div>
          <div>
            <dt>On stale quote</dt>
            <dd>{row.onStaleQuote}</dd>
          </div>
        </dl>
      );
    case "revoke":
      return (
        <dl>
          <div>
            <dt>User can revoke</dt>
            <dd>{row.userCanRevoke ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt>Completion requirement</dt>
            <dd>{row.completionRequirement}</dd>
          </div>
        </dl>
      );
  }
}

function RuntimeConstraints({ rows }: Readonly<{ rows: readonly ConstraintRow[] }>) {
  return (
    <section className="passport-panel" aria-labelledby="permission-preview-runtime-heading">
      <div className="passport-panel-heading">
        <div>
          <span className="step-number">05</span>
          <h3 id="permission-preview-runtime-heading">Runtime and revoke constraints</h3>
        </div>
      </div>
      <dl className="passport-facts permission-preview-constraints">
        {rows.map((row) => (
          <div key={row.rowId} data-constraint-kind={row.kind}>
            <dt>{row.label}</dt>
            <dd>
              <ConstraintValue row={row} />
              <EnforcementOwner owner={row.enforcement} />
              <WorstCase text={row.worstCase} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export interface ActivationPermissionPreviewProps {
  readonly preview: ActivationPermissionPreview;
}

/**
 * Pure evidence renderer. It has no activation, signing, wallet, RPC, or transaction behavior.
 * PlainText values are deliberately interpolated as React text nodes only.
 */
export function ActivationPermissionPreviewView({
  preview
}: Readonly<ActivationPermissionPreviewProps>) {
  return (
    <section
      className="activation-permission-preview"
      aria-labelledby="activation-permission-preview-heading"
    >
      <header>
        <p className="panel-overline">EXACT PERMISSION BOUNDARY</p>
        <h2 id="activation-permission-preview-heading">Activation permission preview</h2>
        <p className="permission-preview-worst-case">{preview.worstCase}</p>
        <p className="decision-hold" role="note">
          Preview only. No activation or transaction has occurred.
        </p>
        <dl className="passport-facts">
          <div>
            <dt>Policy hash</dt>
            <dd className="raw-value">{preview.policyHash}</dd>
          </div>
          <div>
            <dt>Policy version</dt>
            <dd>{preview.policyVersion}</dd>
          </div>
        </dl>
      </header>

      <div className="passport-grid permission-preview-grid">
        <Overview preview={preview} />
        <Calls rows={preview.callRows} />
        <Capital rows={preview.capitalRows} />
        <SpendCaps rows={preview.spendCapRows} />
        <RuntimeConstraints rows={preview.constraintRows} />
        <section className="passport-panel" aria-labelledby="permission-preview-scope-heading">
          <div className="passport-panel-heading">
            <div>
              <span className="step-number">06</span>
              <h3 id="permission-preview-scope-heading">Scope boundary</h3>
            </div>
          </div>
          <p>{preview.scopeBoundary}</p>
          <p className="decision-hold" role="note">
            This preview is not an activation or transaction. It grants no authority and records no
            receipt.
          </p>
        </section>
      </div>
    </section>
  );
}
