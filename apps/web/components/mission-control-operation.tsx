import {
  altanaBootstrapBrowserProjectionSchema,
  altanaExecuteOperationStateSchema,
  altanaRevokeOperationStateSchema,
  type AltanaBootstrapBrowserProjection,
  type AltanaExecuteOperationState,
  type AltanaRevokeOperationState
} from "@proofera/integrations";
import { keccak256 } from "viem";

type AltanaOperationState = AltanaExecuteOperationState | AltanaRevokeOperationState;
type BootstrapStatus = AltanaBootstrapBrowserProjection["lifecycleStatus"];

export interface MissionControlOperationProps {
  readonly operation: AltanaOperationState;
  readonly bootstrap: AltanaBootstrapBrowserProjection;
}

interface OperationPresentation {
  readonly label: string;
  readonly detail: string;
  readonly confirmed: boolean;
  readonly tone: "live" | "caution" | "unknown";
}

const chainPresentation = {
  56: {
    environment: "mainnet",
    label: "BSC mainnet · chain 56",
    bscExplorerOrigin: "https://bscscan.com"
  },
  97: {
    environment: "testnet",
    label: "BSC testnet · chain 97",
    bscExplorerOrigin: "https://testnet.bscscan.com"
  }
} as const;

const ALTANA_TESTNET_EXPLORER_ORIGIN = "https://testnet.altana.network" as const;

const bootstrapLabels = {
  bootstrap_ready: "Bootstrap ready",
  secret_provisioning: "Secret provisioning in progress",
  secret_outcome_unknown: "Secret provisioning outcome unknown",
  grant_ready: "Grant ready — not submitted",
  grant_submitting: "Grant submitting — outcome pending",
  grant_outcome_unknown: "Grant outcome unknown — no blind retry",
  grant_rejected: "Grant rejected",
  grant_failed: "Grant failed",
  authority_pending: "Authority proof pending",
  execution_enabled: "Authority verified for execution",
  grant_expired: "Grant bootstrap expired",
  cleanup_pending: "Secret cleanup pending",
  cleanup_failed: "Secret cleanup failed",
  cleaned: "Secret cleanup complete"
} as const satisfies Readonly<Record<BootstrapStatus, string>>;

function parseOperation(operation: AltanaOperationState): AltanaOperationState {
  return operation.kind === "execute"
    ? altanaExecuteOperationStateSchema.parse(operation)
    : altanaRevokeOperationStateSchema.parse(operation);
}

function executePresentation(operation: AltanaExecuteOperationState): OperationPresentation {
  switch (operation.status) {
    case "ready":
      return {
        label: "Execution ready — not submitted",
        detail: "No execute submission has started and no onchain outcome is claimed.",
        confirmed: false,
        tone: "unknown"
      };
    case "submitting":
      return {
        label: "Execution submitting — outcome pending",
        detail: "Submission is in progress; this is not a confirmed execution.",
        confirmed: false,
        tone: "caution"
      };
    case "pending":
      return {
        label: "Execution pending — not confirmed",
        detail: "Altana returned a calls ID, but the call has not reached a confirmed state.",
        confirmed: false,
        tone: "caution"
      };
    case "confirmed":
      return {
        label: "Execution confirmed",
        detail:
          operation.transactionHash === null
            ? "The typed call lifecycle is confirmed; no transaction hash was supplied."
            : "The typed call lifecycle is confirmed and includes a transaction hash.",
        confirmed: true,
        tone: "live"
      };
    case "failed":
      return {
        label: "Execution failed — not confirmed",
        detail: "The typed lifecycle records a known failure. Retry is not allowed.",
        confirmed: false,
        tone: "caution"
      };
    case "rejected":
      return {
        label: "Execution rejected — not confirmed",
        detail: "The submission was rejected. Retry is not allowed.",
        confirmed: false,
        tone: "caution"
      };
    case "outcome_unknown":
      return {
        label: "Execution outcome unknown — do not retry",
        detail: "A call-status probe is required; an unknown outcome is never promoted to success.",
        confirmed: false,
        tone: "caution"
      };
  }
}

function revokePresentation(operation: AltanaRevokeOperationState): OperationPresentation {
  switch (operation.status) {
    case "ready":
      return {
        label: "Revoke ready — not submitted",
        detail: "No revoke submission has started and session authority may still be active.",
        confirmed: false,
        tone: "unknown"
      };
    case "submitting":
      return {
        label: "Revoke submitting — authority may still be active",
        detail: "Submission is in progress; this is not confirmed revocation.",
        confirmed: false,
        tone: "caution"
      };
    case "pending":
      return operation.relayStatus === "confirmed"
        ? {
            label: "Revoke pending — fresh authority absence required",
            detail:
              "Relay confirmed; revocation is still pending until a fresh authority probe shows the session absent.",
            confirmed: false,
            tone: "caution"
          }
        : {
            label: "Revoke pending — relay not confirmed",
            detail:
              "The relay and authority outcomes remain pending; session authority may still be active.",
            confirmed: false,
            tone: "caution"
          };
    case "confirmed":
      return {
        label: "Revoked — fresh authority absence confirmed",
        detail:
          "Revocation is final only because a fresh authority observation proved the session absent.",
        confirmed: true,
        tone: "live"
      };
    case "failed":
      return {
        label: "Revoke failed — authority may still be active",
        detail: "The revoke lifecycle records a known failure. Retry is not allowed.",
        confirmed: false,
        tone: "caution"
      };
    case "rejected":
      return {
        label: "Revoke rejected — authority may still be active",
        detail: "The revoke request was rejected. Retry is not allowed.",
        confirmed: false,
        tone: "caution"
      };
    case "outcome_unknown":
      return {
        label: "Revoke outcome unknown — authority may still be active",
        detail:
          "A fresh authority probe is required. Unknown revocation is never displayed as complete.",
        confirmed: false,
        tone: "caution"
      };
  }
}

function operationPresentation(operation: AltanaOperationState): OperationPresentation {
  return operation.kind === "execute"
    ? executePresentation(operation)
    : revokePresentation(operation);
}

function operationReason(operation: AltanaOperationState): string | null {
  if (operation.status === "failed" || operation.status === "rejected") {
    return operation.reason;
  }
  if (operation.status === "outcome_unknown") return operation.reasonDetail;
  return null;
}

function operationCallsId(operation: AltanaOperationState): string | null {
  return "callsId" in operation ? operation.callsId : null;
}

function operationTransactionHash(operation: AltanaOperationState): string | null {
  return "transactionHash" in operation ? operation.transactionHash : null;
}

function operationRetryable(operation: AltanaOperationState): false | null {
  return "retryable" in operation ? operation.retryable : null;
}

function bootstrapTone(bootstrap: AltanaBootstrapBrowserProjection): OperationPresentation["tone"] {
  if (bootstrap.executionEnabled) return "live";
  if (
    bootstrap.lifecycleStatus === "bootstrap_ready" ||
    bootstrap.lifecycleStatus === "grant_ready" ||
    bootstrap.lifecycleStatus === "cleaned"
  ) {
    return "unknown";
  }
  return "caution";
}

function publicBindingStatus(
  operation: AltanaOperationState,
  bootstrap: AltanaBootstrapBrowserProjection
): "match" | "mismatch" | "session-unavailable" {
  if (
    operation.chainId !== bootstrap.chainId ||
    operation.walletAddress !== bootstrap.walletAddress.toLowerCase() ||
    operation.policyHash !== bootstrap.policyHash
  ) {
    return "mismatch";
  }
  if (bootstrap.sessionKey === null) return "session-unavailable";
  return operation.sessionKeyAddress === bootstrap.sessionKey.address.toLowerCase()
    ? "match"
    : "mismatch";
}

function isoFromUnixSeconds(value: number): string | null {
  const milliseconds = value * 1_000;
  if (!Number.isSafeInteger(milliseconds)) return null;
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return date.toISOString();
  } catch {
    return null;
  }
}

function StateBadge({
  label,
  tone
}: Readonly<{ label: string; tone: OperationPresentation["tone"] }>) {
  const className =
    tone === "live"
      ? "state-badge state-live"
      : tone === "caution"
        ? "state-badge state-caution"
        : "state-badge state-unknown";
  return <span className={className}>{label}</span>;
}

function BscAddressLink({
  address,
  chainId,
  children
}: Readonly<{ address: string; chainId: 56 | 97; children: string }>) {
  return (
    <a
      href={`${chainPresentation[chainId].bscExplorerOrigin}/address/${address}`}
      rel="noopener noreferrer"
      target="_blank"
    >
      {children} <span aria-hidden="true">↗</span>
    </a>
  );
}

function OperationPanel({ operation }: Readonly<{ operation: AltanaOperationState }>) {
  const presentation = operationPresentation(operation);
  const network = chainPresentation[operation.chainId];
  const callsId = operationCallsId(operation);
  const transactionHash = operationTransactionHash(operation);
  const reason = operationReason(operation);
  const retryable = operationRetryable(operation);

  return (
    <article
      aria-label={`${operation.kind} operation ${operation.operationId}`}
      className="passport-panel"
      data-confirmation-state={presentation.confirmed ? "confirmed" : "not-confirmed"}
      data-environment={network.environment}
      data-operation-kind={operation.kind}
      data-operation-status={operation.status}
    >
      <div className="passport-panel-heading">
        <div>
          <span className="step-number">OP</span>
          <h3>{operation.kind === "execute" ? "Execute lifecycle" : "Revoke lifecycle"}</h3>
        </div>
        <StateBadge label={presentation.label} tone={presentation.tone} />
      </div>

      <p className={presentation.confirmed ? "agent-summary" : "decision-hold"}>
        {presentation.detail}
      </p>

      <dl className="passport-facts">
        <div>
          <dt>Network</dt>
          <dd>
            <span
              className={
                operation.chainId === 56 ? "state-badge state-caution" : "state-badge state-unknown"
              }
            >
              {network.label}
            </span>
          </dd>
        </div>
        <div>
          <dt>Wallet public ID</dt>
          <dd className="raw-value">
            <BscAddressLink address={operation.walletAddress} chainId={operation.chainId}>
              {operation.walletAddress}
            </BscAddressLink>
          </dd>
        </div>
        <div>
          <dt>Session public ID</dt>
          <dd className="raw-value">
            <BscAddressLink address={operation.sessionKeyAddress} chainId={operation.chainId}>
              {operation.sessionKeyAddress}
            </BscAddressLink>
          </dd>
        </div>
        <div>
          <dt>Policy hash</dt>
          <dd className="raw-value">{operation.policyHash}</dd>
        </div>
        <div>
          <dt>Operation ID</dt>
          <dd className="raw-value">{operation.operationId}</dd>
        </div>
        <div>
          <dt>Idempotency ID</dt>
          <dd className="raw-value">{operation.idempotencyKey}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{presentation.label}</dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd className="raw-value">{operation.createdAt}</dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd className="raw-value">{operation.updatedAt}</dd>
        </div>
        <div>
          <dt>Session expiry / Unix seconds</dt>
          <dd className="raw-value">{operation.sessionExpiry}</dd>
        </div>
        <div>
          <dt>Session expiry / UTC</dt>
          <dd className="raw-value">
            {isoFromUnixSeconds(operation.sessionExpiry) ??
              "Unknown — expiry cannot be represented safely as UTC"}
          </dd>
        </div>
        {callsId === null ? null : (
          <div>
            <dt>Calls ID</dt>
            <dd className="raw-value">{callsId}</dd>
          </div>
        )}
        {transactionHash === null ? null : (
          <div>
            <dt>Transaction hash</dt>
            <dd className="raw-value">
              <a
                href={`${network.bscExplorerOrigin}/tx/${transactionHash}`}
                rel="noopener noreferrer"
                target="_blank"
              >
                {transactionHash} <span aria-hidden="true">↗</span>
              </a>
            </dd>
          </div>
        )}
        {operation.kind === "revoke" && operation.status === "pending" ? (
          <>
            <div>
              <dt>Relay state</dt>
              <dd>{operation.relayStatus}</dd>
            </div>
            <div>
              <dt>Authority state</dt>
              <dd>{operation.authorityStatus.replaceAll("_", " ")}</dd>
            </div>
          </>
        ) : null}
        {operation.kind === "revoke" && operation.status === "confirmed" ? (
          <div>
            <dt>Confirmation proof</dt>
            <dd>
              fresh authority absent at{" "}
              <span className="raw-value">{operation.authorityObservedAt}</span>
            </dd>
          </div>
        ) : null}
        {retryable === false ? (
          <div>
            <dt>Retry</dt>
            <dd>Not allowed; no retry control is rendered.</dd>
          </div>
        ) : null}
      </dl>

      {reason === null ? null : (
        <div className="registry-footnote" data-reason-text="untrusted-text-only">
          <strong>Recorded reason / text only</strong>
          <p>{reason}</p>
        </div>
      )}
    </article>
  );
}

function BootstrapPanel({
  bootstrap,
  bindingStatus
}: Readonly<{
  bootstrap: AltanaBootstrapBrowserProjection;
  bindingStatus: ReturnType<typeof publicBindingStatus>;
}>) {
  const session = bootstrap.sessionKey;
  const executionEnabled = bootstrap.executionEnabled && bindingStatus === "match";

  return (
    <article
      aria-label={`Altana bootstrap ${bootstrap.bootstrapId}`}
      className="passport-panel"
      data-bootstrap-environment="testnet"
      data-bootstrap-status={bootstrap.lifecycleStatus}
      data-execution-enabled={executionEnabled ? "true" : "false"}
    >
      <div className="passport-panel-heading">
        <div>
          <span className="step-number">KEY</span>
          <h3>Bootstrap and session authority</h3>
        </div>
        <StateBadge
          label={bootstrapLabels[bootstrap.lifecycleStatus]}
          tone={bootstrapTone({ ...bootstrap, executionEnabled })}
        />
      </div>

      <p className={executionEnabled ? "agent-summary" : "decision-hold"}>
        {executionEnabled
          ? "Execution is enabled by the typed browser projection and the displayed public binding matches this operation."
          : bootstrap.executionEnabled
            ? "The projection flag is enabled, but the public binding does not match this operation; Mission Control keeps execution disabled."
            : "Execution is disabled by the typed browser projection; lifecycle labels do not override that flag."}
      </p>

      <dl className="passport-facts">
        <div>
          <dt>Bootstrap network</dt>
          <dd>
            <span className="state-badge state-unknown">BSC testnet · chain 97</span>
          </dd>
        </div>
        <div>
          <dt>Lifecycle</dt>
          <dd>{bootstrapLabels[bootstrap.lifecycleStatus]}</dd>
        </div>
        <div>
          <dt>Execution projection</dt>
          <dd>{bootstrap.executionEnabled ? "Enabled" : "Disabled"}</dd>
        </div>
        <div>
          <dt>Public binding</dt>
          <dd>{bindingStatus.replaceAll("-", " ")}</dd>
        </div>
        <div>
          <dt>Bootstrap ID</dt>
          <dd className="raw-value">{bootstrap.bootstrapId}</dd>
        </div>
        <div>
          <dt>User public ID</dt>
          <dd className="raw-value">{bootstrap.userId}</dd>
        </div>
        <div>
          <dt>Wallet public ID</dt>
          <dd className="raw-value">
            <a
              href={`${ALTANA_TESTNET_EXPLORER_ORIGIN}/account/${bootstrap.walletAddress}`}
              rel="noopener noreferrer"
              target="_blank"
            >
              {bootstrap.walletAddress} <span aria-hidden="true">↗</span>
            </a>
          </dd>
        </div>
        <div>
          <dt>Policy hash</dt>
          <dd className="raw-value">{bootstrap.policyHash}</dd>
        </div>
        <div>
          <dt>Bootstrap binding hash</dt>
          <dd className="raw-value">{bootstrap.bootstrapBindingHash}</dd>
        </div>
        <div>
          <dt>Bootstrap expiry / Unix seconds</dt>
          <dd className="raw-value">{bootstrap.bootstrapExpiresAt}</dd>
        </div>
        <div>
          <dt>Bootstrap expiry / UTC</dt>
          <dd className="raw-value">
            {isoFromUnixSeconds(bootstrap.bootstrapExpiresAt) ??
              "Unknown — expiry cannot be represented safely as UTC"}
          </dd>
        </div>
        <div>
          <dt>Session expiry / Unix seconds</dt>
          <dd className="raw-value">{bootstrap.sessionExpiry}</dd>
        </div>
        <div>
          <dt>Session expiry / UTC</dt>
          <dd className="raw-value">
            {isoFromUnixSeconds(bootstrap.sessionExpiry) ??
              "Unknown — expiry cannot be represented safely as UTC"}
          </dd>
        </div>
        <div>
          <dt>Grant retry</dt>
          <dd>Not allowed; no retry control is rendered.</dd>
        </div>
        <div>
          <dt>Cleanup</dt>
          <dd>{bootstrap.cleanupStatus.replaceAll("_", " ")}</dd>
        </div>
        {session === null ? (
          <div>
            <dt>Session public descriptor</dt>
            <dd>Not present in this typed browser projection.</dd>
          </div>
        ) : (
          <>
            <div>
              <dt>Session public ID</dt>
              <dd className="raw-value">{session.address}</dd>
            </div>
            <div>
              <dt>Session public key</dt>
              <dd className="raw-value">
                <a
                  href={`${ALTANA_TESTNET_EXPLORER_ORIGIN}/key/${keccak256(session.publicKey)}`}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {session.publicKey} <span aria-hidden="true">↗</span>
                </a>
              </dd>
            </div>
            <div>
              <dt>Custody boundary</dt>
              <dd>{session.custody}</dd>
            </div>
          </>
        )}
      </dl>
    </article>
  );
}

/**
 * Read-only Mission Control renderer. It performs runtime validation, derives no
 * optimistic state, and intentionally exposes no submit, retry, wallet, or signing control.
 */
export function MissionControlOperation({
  operation: unparsedOperation,
  bootstrap: unparsedBootstrap
}: MissionControlOperationProps) {
  const operation = parseOperation(unparsedOperation);
  const bootstrap = altanaBootstrapBrowserProjectionSchema.parse(unparsedBootstrap);
  const bindingStatus = publicBindingStatus(operation, bootstrap);

  return (
    <section
      aria-label="Altana Mission Control lifecycle"
      className="passport-grid"
      data-mission-control="read-only"
    >
      <OperationPanel operation={operation} />
      <BootstrapPanel bootstrap={bootstrap} bindingStatus={bindingStatus} />
    </section>
  );
}
