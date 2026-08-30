import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  configurableReferenceCategories,
  isReferenceConfigurationCategory,
  parseReferenceAgentConfiguration,
  type HealthConfigurationFormValues,
  type ReferenceAgentConfiguration,
  type ReferenceConfigurationCategory,
  type ReferenceConfigurationFormValues,
  type ReferenceConfigurationIssue,
  type ReferenceConfigurationQueryField,
  type ReferenceConfigurationReadiness,
  type ReferenceConfigurationSearchParams
} from "../../../lib/reference-agent-configuration";

export const dynamic = "force-dynamic";
export const dynamicParams = false;

interface ConfigurePageProps {
  readonly params: Promise<{ category: string }>;
  readonly searchParams: Promise<ReferenceConfigurationSearchParams>;
}

const presentation = {
  "grid-trading": {
    label: "Grid trading",
    eyebrow: "GRID TRADING / MANDATE ONLY",
    title: "Bound the grid before price access.",
    description:
      "Capture capital, market range, loss tolerance, and execution limits without claiming a quote, fill, PnL, or live agent.",
    capitalLabel: "Maximum strategy capital / raw base-unit uint256 bound",
    evidence:
      "A trusted pair and token-decimal join, current market/range observation, quote, liquidity, code identity, fill history, and all-in cost evidence are still required."
  },
  "yield-optimisation": {
    label: "Yield optimisation",
    eyebrow: "YIELD OPTIMISATION / MANDATE ONLY",
    title: "Set the yield mandate before rates.",
    description:
      "Capture allocation, protocol preference, exit liquidity, and cost thresholds without presenting an APY, route, or live opportunity.",
    capitalLabel: "Maximum allocation / raw base-unit uint256 bound",
    evidence:
      "Trusted protocol and token identity, current base/reward rates, liquidity, withdrawal constraints, route availability, token decimals, and costs are still required."
  },
  "health-factor-monitoring": {
    label: "Health-factor monitoring",
    eyebrow: "HEALTH-FACTOR MONITORING / MANDATE ONLY",
    title: "Set protection thresholds before account access.",
    description:
      "Capture alert and intervention boundaries without reading an account, calculating a health factor, or promising liquidation protection.",
    capitalLabel: "Maximum intervention capital / raw base-unit uint256 bound",
    evidence:
      "A trusted account and market join, collateral, debt, oracle prices, liquidation rules, coherent observation window, and alert receipts are still required."
  }
} as const satisfies Record<
  ReferenceConfigurationCategory,
  Readonly<{
    label: string;
    eyebrow: string;
    title: string;
    description: string;
    capitalLabel: string;
    evidence: string;
  }>
>;

const riskOptions = [
  ["conservative", "Conservative"],
  ["balanced", "Balanced"],
  ["adventurous", "Adventurous"]
] as const;

const optionSets = {
  "grid-trading": {
    network: [["bsc-testnet", "BSC testnet (97)"]],
    horizon: [
      ["hours", "Hours"],
      ["days", "Days"],
      ["weeks", "Weeks"]
    ],
    asset: [
      ["bnb-usdt", "BNB / USDT"],
      ["cake-usdt", "CAKE / USDT"],
      ["bnb-cake", "BNB / CAKE"]
    ],
    protocol: [["pancakeswap-v3", "PancakeSwap V3"]]
  },
  "yield-optimisation": {
    network: [["bsc-testnet", "BSC testnet (97)"]],
    horizon: [
      ["weeks", "Weeks"],
      ["months", "Months"],
      ["year-plus", "One year or longer"]
    ],
    asset: [
      ["stablecoins", "Stablecoins"],
      ["bnb", "BNB"],
      ["cake", "CAKE"]
    ],
    protocol: [
      ["venus", "Venus"],
      ["pancakeswap", "PancakeSwap"]
    ]
  },
  "health-factor-monitoring": {
    network: [["bsc-testnet", "BSC testnet (97)"]],
    horizon: [
      ["continuous", "Continuous monitoring"],
      ["days", "Days"],
      ["weeks", "Weeks"]
    ],
    asset: [
      ["mixed", "Mixed collateral and debt"],
      ["bnb", "BNB"],
      ["stablecoins", "Stablecoins"],
      ["cake", "CAKE"]
    ],
    protocol: [["venus", "Venus"]]
  }
} as const;

const readinessLabels: Readonly<Record<keyof ReferenceConfigurationReadiness["flags"], string>> =
  Object.freeze({
    trustedEvidenceReady: "Trusted evidence ready",
    verifiedAgentIdentityReady: "Verified agent identity ready",
    marketplaceEligibilityReady: "Marketplace eligibility ready",
    permissionPreviewReady: "Permission preview ready",
    scopedAuthorityReady: "Scoped authority ready",
    transactionReceiptReady: "Transaction receipt ready",
    activationReady: "Activation ready",
    executionReady: "Execution ready",
    revokeReady: "Revoke ready"
  });

export function generateStaticParams(): Array<{ category: ReferenceConfigurationCategory }> {
  return configurableReferenceCategories.map((category) => ({ category }));
}

export async function generateMetadata({ params }: ConfigurePageProps): Promise<Metadata> {
  const { category } = await params;
  if (!isReferenceConfigurationCategory(category)) {
    return { title: "Mandate category not found" };
  }
  return {
    title: `${presentation[category].label} mandate configuration`,
    description: `${presentation[category].description} Configuration only; no evidence, identity, authority, or transaction is created.`
  };
}

function fieldIssueMessages(
  issues: readonly ReferenceConfigurationIssue[],
  field: ReferenceConfigurationQueryField
): readonly string[] {
  return issues.filter((issue) => issue.field === field).map((issue) => issue.message);
}

function SelectField({
  label,
  name,
  value,
  options,
  issues
}: Readonly<{
  label: string;
  name: ReferenceConfigurationQueryField;
  value: string;
  options: readonly (readonly [string, string])[];
  issues: readonly ReferenceConfigurationIssue[];
}>) {
  const errorMessages = fieldIssueMessages(issues, name);
  const errorId = `mandate-${name}-errors`;
  return (
    <label>
      {label}
      <select
        aria-describedby={errorMessages.length > 0 ? errorId : undefined}
        aria-invalid={errorMessages.length > 0 ? true : undefined}
        defaultValue={value}
        name={name}
        required
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
      {errorMessages.length > 0 ? (
        <span className="form-field-error" id={errorId}>
          {errorMessages.join(" ")}
        </span>
      ) : null}
    </label>
  );
}

function RawInput({
  label,
  name,
  value,
  issues,
  placeholder
}: Readonly<{
  label: string;
  name: ReferenceConfigurationQueryField;
  value: string;
  issues: readonly ReferenceConfigurationIssue[];
  placeholder: string;
}>) {
  const errorMessages = fieldIssueMessages(issues, name);
  const errorId = `mandate-${name}-errors`;
  return (
    <label>
      {label}
      <input
        aria-describedby={errorMessages.length > 0 ? errorId : undefined}
        aria-invalid={errorMessages.length > 0 ? true : undefined}
        autoComplete="off"
        defaultValue={value}
        inputMode="decimal"
        maxLength={78}
        name={name}
        placeholder={placeholder}
        required
        spellCheck={false}
      />
      {errorMessages.length > 0 ? (
        <span className="form-field-error" id={errorId}>
          {errorMessages.join(" ")}
        </span>
      ) : null}
    </label>
  );
}

function MandateForm({
  values,
  issues = []
}: Readonly<{
  values: ReferenceConfigurationFormValues;
  issues?: readonly ReferenceConfigurationIssue[];
}>) {
  const copy = presentation[values.category];
  const options = optionSets[values.category];
  const queryIssues = issues.filter((issue) => issue.field === "query");
  return (
    <form className="intent-form" action={`/configure/${values.category}`} method="get">
      <div className="panel-heading">
        <span className="step-number">01</span>
        <div>
          <p className="panel-overline">USER-CONTROLLED FIELDS ONLY</p>
          <h2 id="mandate-form-heading">Define the mandate</h2>
        </div>
      </div>

      {queryIssues.length > 0 ? (
        <div className="form-query-error" role="alert">
          <strong>Request-level error</strong>
          <ul>
            {queryIssues.map((issue) => (
              <li key={issue.message}>{issue.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <RawInput
        issues={issues}
        label={copy.capitalLabel}
        name="capitalRaw"
        placeholder="Canonical uint256 string; token meaning unverified"
        value={values.capitalRaw}
      />
      <div className="form-grid">
        <SelectField
          issues={issues}
          label="BSC network"
          name="network"
          options={options.network}
          value={values.network}
        />
        <SelectField
          issues={issues}
          label="Risk tolerance"
          name="risk"
          options={riskOptions}
          value={values.risk}
        />
        <SelectField
          issues={issues}
          label="Time horizon"
          name="horizon"
          options={options.horizon}
          value={values.horizon}
        />
        <SelectField
          issues={issues}
          label="Preferred asset or pair"
          name="asset"
          options={options.asset}
          value={values.asset}
        />
        <SelectField
          issues={issues}
          label="Permitted protocol"
          name="protocol"
          options={options.protocol}
          value={values.protocol}
        />

        {values.category === "grid-trading" ? (
          <>
            <RawInput
              issues={issues}
              label="Lower grid price / user threshold"
              name="lowerPriceRaw"
              placeholder="No live price is read"
              value={values.lowerPriceRaw}
            />
            <RawInput
              issues={issues}
              label="Upper grid price / user threshold"
              name="upperPriceRaw"
              placeholder="Must exceed lower threshold"
              value={values.upperPriceRaw}
            />
            <RawInput
              issues={issues}
              label="Grid levels / integer"
              name="gridLevels"
              placeholder="2–100"
              value={values.gridLevels}
            />
            <RawInput
              issues={issues}
              label="Maximum drawdown / bps"
              name="maxDrawdownBps"
              placeholder="1–10000"
              value={values.maxDrawdownBps}
            />
            <RawInput
              issues={issues}
              label="Maximum slippage / bps"
              name="maxSlippageBps"
              placeholder="1–500"
              value={values.maxSlippageBps}
            />
          </>
        ) : values.category === "yield-optimisation" ? (
          <>
            <RawInput
              issues={issues}
              label="Minimum acceptable net APY / bps (user threshold)"
              name="minimumNetApyBps"
              placeholder="No APY is fetched"
              value={values.minimumNetApyBps}
            />
            <RawInput
              issues={issues}
              label="Minimum immediately withdrawable share / bps"
              name="minimumWithdrawableBps"
              placeholder="1–10000"
              value={values.minimumWithdrawableBps}
            />
            <RawInput
              issues={issues}
              label="Maximum gas cost / raw base-unit uint256 bound"
              name="maxGasCostRaw"
              placeholder="Integer only; no gas quote or unit conversion"
              value={values.maxGasCostRaw}
            />
          </>
        ) : (
          <HealthThresholdFields issues={issues} values={values} />
        )}
      </div>

      <p className="registry-footnote">
        Values are user constraints, not market observations. The server does not read RPC,
        protocol, wallet, environment, or transaction state on this route. Raw base-unit bounds are
        preserved exactly; their asset denomination and decimals are not established here.
      </p>
      <button className="button button-primary" type="submit">
        Review mandate
      </button>
    </form>
  );
}

function HealthThresholdFields({
  values,
  issues
}: Readonly<{
  values: HealthConfigurationFormValues;
  issues: readonly ReferenceConfigurationIssue[];
}>) {
  return (
    <>
      <RawInput
        issues={issues}
        label="Warning health factor / user threshold"
        name="warningHealthFactorRaw"
        placeholder="Must exceed critical threshold"
        value={values.warningHealthFactorRaw}
      />
      <RawInput
        issues={issues}
        label="Critical health factor / user threshold"
        name="criticalHealthFactorRaw"
        placeholder="Must be greater than 1"
        value={values.criticalHealthFactorRaw}
      />
      <RawInput
        issues={issues}
        label="Target health factor after review / user threshold"
        name="targetHealthFactorRaw"
        placeholder="Must exceed warning threshold"
        value={values.targetHealthFactorRaw}
      />
      <RawInput
        issues={issues}
        label="Maximum repay amount / raw base-unit uint256 bound"
        name="maxRepayRaw"
        placeholder="Integer only; zero means alert only"
        value={values.maxRepayRaw}
      />
    </>
  );
}

function BlankState({ category }: Readonly<{ category: ReferenceConfigurationCategory }>) {
  return (
    <aside className="intent-readout pancake-query-state" role="status">
      <p className="panel-overline">NO MANDATE YET</p>
      <h2>Set constraints before evidence.</h2>
      <p>
        No RPC, protocol, wallet, environment, or transaction request has been made. Submitting the
        form creates only a normalized {presentation[category].label.toLowerCase()} request.
      </p>
      <div className="decision-hold">
        <strong>Identity verified; strategy readiness remains blocked</strong>
        <p>
          The category agent has a finalized BSC-testnet identity. Trusted strategy evidence,
          permissions, authority, receipts, and revoke state are absent.
        </p>
      </div>
    </aside>
  );
}

function InvalidState({ issues }: Readonly<{ issues: readonly ReferenceConfigurationIssue[] }>) {
  return (
    <aside className="intent-readout pancake-query-state" role="alert">
      <p className="panel-overline">MANDATE REJECTED</p>
      <h2>Correct the user boundary.</h2>
      <p>No RPC, fetch, wallet, environment, or write operation was performed.</p>
      <ul>
        {issues.map((issue) => (
          <li key={`${issue.field}:${issue.message}`}>
            <strong>{issue.field}:</strong> {issue.message}
          </li>
        ))}
      </ul>
      <div className="decision-hold">
        <strong>Rejected input creates no evidence</strong>
        <p>
          No value was inferred as a price, APY, health factor, identity, permission, or receipt.
        </p>
      </div>
    </aside>
  );
}

function SummaryState({ values }: Readonly<{ values: ReferenceConfigurationFormValues }>) {
  const categorySpecific = summaryFacts(values);
  return (
    <aside className="intent-readout" aria-label="Normalized user-controlled mandate">
      <p className="panel-overline">NORMALIZED USER REQUEST</p>
      <h2>{presentation[values.category].label} mandate</h2>
      <dl>
        <div>
          <dt>Capital</dt>
          <dd className="raw-value">{values.capitalRaw}</dd>
        </div>
        <div>
          <dt>Network</dt>
          <dd>BSC testnet / 97</dd>
        </div>
        <div>
          <dt>Risk</dt>
          <dd>{values.risk}</dd>
        </div>
        <div>
          <dt>Horizon</dt>
          <dd>{values.horizon}</dd>
        </div>
        <div>
          <dt>Asset</dt>
          <dd className="raw-value">{values.asset}</dd>
        </div>
        <div>
          <dt>Protocol</dt>
          <dd className="raw-value">{values.protocol}</dd>
        </div>
        {categorySpecific.slice(0, 2).map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd className="raw-value">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="decision-hold">
        <strong>Configuration only</strong>
        <p>No recommendation, permission preview, agent selection, or execution request exists.</p>
      </div>
    </aside>
  );
}

function summaryFacts(
  values: ReferenceConfigurationFormValues
): readonly (readonly [string, string])[] {
  switch (values.category) {
    case "grid-trading":
      return [
        ["Lower price", values.lowerPriceRaw],
        ["Upper price", values.upperPriceRaw],
        ["Grid levels", values.gridLevels],
        ["Max drawdown", `${values.maxDrawdownBps} bps`],
        ["Max slippage", `${values.maxSlippageBps} bps`]
      ];
    case "yield-optimisation":
      return [
        ["Minimum net APY", `${values.minimumNetApyBps} bps`],
        ["Withdrawable share", `${values.minimumWithdrawableBps} bps`],
        ["Maximum gas", values.maxGasCostRaw]
      ];
    case "health-factor-monitoring":
      return [
        ["Warning threshold", values.warningHealthFactorRaw],
        ["Critical threshold", values.criticalHealthFactorRaw],
        ["Target threshold", values.targetHealthFactorRaw],
        ["Maximum repay", values.maxRepayRaw]
      ];
  }
}

function ConfigurationReadiness({
  configuration,
  readiness
}: Readonly<{
  configuration: ReferenceAgentConfiguration;
  readiness: ReferenceConfigurationReadiness;
}>) {
  const facts = summaryFacts(configuration);
  return (
    <section className="shell pancake-result" aria-labelledby="mandate-readiness-heading">
      <div className="pancake-result-heading">
        <div>
          <span className="state-badge state-caution">Readiness blocked</span>
          <h2 id="mandate-readiness-heading">
            Mandate captured. Identity verified; trust incomplete.
          </h2>
        </div>
        <span className="state-badge state-caution">BSC testnet / chain 97</span>
      </div>

      <div className="unavailable-panel" role="status">
        <div>
          <h3>No trusted handoff has occurred.</h3>
          <p>{presentation[configuration.category].evidence}</p>
        </div>
        <ul>
          {readiness.blockers.map((blocker) => (
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
              <h2>Complete normalized request</h2>
            </div>
            <span className="state-badge state-unknown">Submitted form values</span>
          </div>
          <dl className="pancake-facts">
            <div>
              <dt>Capital / raw</dt>
              <dd className="raw-value">{configuration.capitalRaw}</dd>
            </div>
            <div>
              <dt>Network</dt>
              <dd>BSC testnet / chain 97</dd>
            </div>
            <div>
              <dt>Risk / horizon</dt>
              <dd>
                {configuration.risk} / {configuration.horizon}
              </dd>
            </div>
            <div>
              <dt>Asset / protocol</dt>
              <dd className="raw-value">
                {configuration.asset} / {configuration.protocol}
              </dd>
            </div>
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd className="raw-value">{value}</dd>
              </div>
            ))}
          </dl>
        </article>

        <article className="passport-panel">
          <div className="passport-panel-heading">
            <div>
              <span className="step-number">03</span>
              <h2>Readiness flags</h2>
            </div>
            <span className="state-badge state-caution">1 verified · 8 blocked</span>
          </div>
          <dl className="pancake-facts">
            {(Object.keys(readinessLabels) as Array<keyof typeof readinessLabels>).map((key) => (
              <div key={key}>
                <dt>{readinessLabels[key]}</dt>
                <dd>
                  <span
                    className={
                      readiness.flags[key]
                        ? "state-badge state-available"
                        : "state-badge state-caution"
                    }
                  >
                    {readiness.flags[key] ? "True" : "False"}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </article>
      </div>

      <div className="decision-hold pancake-identity-boundary">
        <strong>No side effect boundary crossed</strong>
        <p>
          This configuration handler performed no RPC read, HTTP fetch, wallet access, application
          environment lookup, or write. A later evidence service must independently establish every
          trusted fact.
        </p>
        <Link
          className="button button-secondary button-arrow"
          href={`/studio?agent=${configuration.category}`}
        >
          Run this category in Studio <span aria-hidden="true">→</span>
        </Link>
        <p>
          Studio runs a separate read-only chain-97 scenario. It does not treat this mandate as
          source evidence or carry configuration values into an agent request.
        </p>
        <Link className="text-link" href="/session-control">
          Inspect the bounded session-key model <span aria-hidden="true">→</span>
        </Link>
        <p>
          Session Control currently proves only the PTA amount-0 test action; it does not activate
          this configured strategy.
        </p>
      </div>
    </section>
  );
}

export default async function ConfigureReferenceAgentPage({
  params,
  searchParams
}: ConfigurePageProps) {
  const { category } = await params;
  if (!isReferenceConfigurationCategory(category)) notFound();
  const state = parseReferenceAgentConfiguration(category, await searchParams);
  const copy = presentation[category];

  return (
    <main id="main-content" tabIndex={-1}>
      <header className="shell pancake-position-header">
        <span className="eyebrow">{copy.eyebrow}</span>
        <h1>{copy.title}</h1>
        <p className="lede">{copy.description}</p>
      </header>

      <section className="shell pancake-inspector" aria-labelledby="mandate-form-heading">
        <MandateForm
          values={state.formValues}
          issues={state.status === "invalid" ? state.issues : []}
        />
        {state.status === "blank" ? (
          <BlankState category={category} />
        ) : state.status === "invalid" ? (
          <InvalidState issues={state.issues} />
        ) : (
          <SummaryState values={state.formValues} />
        )}
      </section>

      {state.status === "configured" ? (
        <ConfigurationReadiness configuration={state.configuration} readiness={state.readiness} />
      ) : null}
    </main>
  );
}
