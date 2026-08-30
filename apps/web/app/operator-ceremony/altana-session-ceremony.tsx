"use client";

import { useCallback, useEffect, useState, useSyncExternalStore, type MouseEvent } from "react";

import {
  altanaTestActionConfigSchema,
  altanaTestActionPublicStateSchema,
  createAltanaTestActionGrantIntent,
  createPublicOnlySessionSigner,
  type AltanaTestActionConfig,
  type AltanaTestActionPublicState,
  type SerializedSessionGrantIntent
} from "@proofera/integrations";

import {
  PASSKEY_WALLET_EVENT,
  readStoredWallet,
  type StoredPasskeyWallet
} from "./altana-passkey-ceremony";

const OPERATION_STORAGE_KEY = "proofera.altana.test-action.v2";
const OPERATION_EVENT = "proofera-altana-test-action-change";
const RELAY_ORIGIN = "https://testnet-relay.altana.network";

type BrowserOperationStatus =
  | "grant_submitting"
  | "grant_confirmed_probe_required"
  | "grant_outcome_unknown"
  | "revoke_submitting"
  | "revoke_confirmed_probe_required"
  | "revoke_outcome_unknown";

export interface RelayCapture {
  readonly callsId: `0x${string}` | null;
  readonly transactionHash: `0x${string}` | null;
}

class RelayCapturedError extends Error {
  readonly capture: RelayCapture;
  readonly original: unknown;

  constructor(original: unknown, capture: RelayCapture) {
    super("ALTANA_RELAY_OPERATION_THROWN");
    this.name = "RelayCapturedError";
    this.original = original;
    this.capture = capture;
  }
}

interface BrowserOperation {
  readonly schemaVersion: 1;
  readonly walletAddress: string;
  readonly sessionPublicKey: `0x${string}`;
  readonly status: BrowserOperationStatus;
  readonly intent: SerializedSessionGrantIntent;
  readonly grant: RelayCapture;
  readonly revoke: RelayCapture | null;
  readonly updatedAt: string;
}

type WorkerResult =
  | { readonly availability: "available"; readonly state: AltanaTestActionPublicState }
  | {
      readonly availability: "unavailable";
      readonly reason: "runtime_not_configured" | "worker_not_started" | "invalid_public_state";
    };

interface AltanaSessionCeremonyProps {
  readonly config: AltanaTestActionConfig;
  readonly rpId: string;
}

function walletSnapshot(rpId: string): string {
  const wallet = readStoredWallet(rpId);
  return wallet === null ? "missing" : JSON.stringify(wallet);
}

function parseWallet(snapshot: string): StoredPasskeyWallet | null {
  if (snapshot === "missing" || snapshot === "server") return null;
  try {
    return JSON.parse(snapshot) as StoredPasskeyWallet;
  } catch {
    return null;
  }
}

function exactRelayCapture(value: unknown): RelayCapture | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const callsId =
    typeof record.callsId === "string" && /^0x(?:[0-9a-fA-F]{2})+$/.test(record.callsId)
      ? (record.callsId.toLowerCase() as `0x${string}`)
      : null;
  const transactionHash =
    typeof record.transactionHash === "string" && /^0x[0-9a-fA-F]{64}$/.test(record.transactionHash)
      ? (record.transactionHash.toLowerCase() as `0x${string}`)
      : null;
  return { callsId, transactionHash };
}

function readBrowserOperation(config: AltanaTestActionConfig): BrowserOperation | null {
  try {
    const raw = window.localStorage.getItem(OPERATION_STORAGE_KEY);
    if (raw === null || raw.length > 32_768) return null;
    const value = JSON.parse(raw) as unknown;
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    const intent = record.intent;
    if (
      record.schemaVersion !== 1 ||
      record.walletAddress !== config.walletAddress ||
      record.sessionPublicKey !== config.sessionKey.publicKey ||
      ![
        "grant_submitting",
        "grant_confirmed_probe_required",
        "grant_outcome_unknown",
        "revoke_submitting",
        "revoke_confirmed_probe_required",
        "revoke_outcome_unknown"
      ].includes(String(record.status)) ||
      typeof record.updatedAt !== "string" ||
      typeof intent !== "object" ||
      intent === null ||
      Array.isArray(intent)
    ) {
      return null;
    }
    const intentRecord = intent as Record<string, unknown>;
    if (
      intentRecord.walletAddress !== config.walletAddress ||
      typeof intentRecord.sessionKey !== "object" ||
      intentRecord.sessionKey === null ||
      (intentRecord.sessionKey as Record<string, unknown>).publicKey !== config.sessionKey.publicKey
    ) {
      return null;
    }
    const grant = exactRelayCapture(record.grant);
    const revoke = record.revoke === null ? null : exactRelayCapture(record.revoke);
    if (grant === null || (record.revoke !== null && revoke === null)) return null;
    return value as BrowserOperation;
  } catch {
    return null;
  }
}

function operationSnapshot(config: AltanaTestActionConfig): string {
  const operation = readBrowserOperation(config);
  return operation === null ? "idle" : JSON.stringify(operation);
}

function parseOperation(snapshot: string): BrowserOperation | null {
  if (snapshot === "idle" || snapshot === "server") return null;
  try {
    return JSON.parse(snapshot) as BrowserOperation;
  } catch {
    return null;
  }
}

function retainOperation(operation: BrowserOperation): void {
  window.localStorage.setItem(OPERATION_STORAGE_KEY, JSON.stringify(operation));
  window.dispatchEvent(new Event(OPERATION_EVENT));
}

function requestBody(
  input: RequestInfo | URL,
  init: RequestInit | undefined
): Promise<string | null> {
  if (typeof init?.body === "string") return Promise.resolve(init.body);
  if (typeof Request === "function" && input instanceof Request) {
    return input
      .clone()
      .text()
      .catch(() => null);
  }
  return Promise.resolve(null);
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

export function isPublicRelayEvidenceMethod(
  method: unknown
): method is "wallet_sendCalls" | "wallet_sendPreparedCalls" | "wallet_getCallsStatus" {
  return (
    method === "wallet_sendCalls" ||
    method === "wallet_sendPreparedCalls" ||
    method === "wallet_getCallsStatus"
  );
}

export function publicRelayResult(
  method: string,
  value: unknown,
  capture: RelayCapture
): RelayCapture {
  if (method === "wallet_sendCalls" || method === "wallet_sendPreparedCalls") {
    const callsId =
      typeof value === "string"
        ? value
        : typeof value === "object" && value !== null && "id" in value
          ? (value as { readonly id?: unknown }).id
          : null;
    return typeof callsId === "string" && /^0x(?:[0-9a-fA-F]{2})+$/.test(callsId)
      ? { ...capture, callsId: callsId.toLowerCase() as `0x${string}` }
      : capture;
  }
  if (method !== "wallet_getCallsStatus" || typeof value !== "object" || value === null) {
    return capture;
  }
  const receipts = (value as { readonly receipts?: unknown }).receipts;
  const receipt = Array.isArray(receipts) ? receipts[0] : null;
  const transactionHash =
    typeof receipt === "object" &&
    receipt !== null &&
    "transactionHash" in receipt &&
    typeof receipt.transactionHash === "string" &&
    /^0x[0-9a-fA-F]{64}$/.test(receipt.transactionHash)
      ? (receipt.transactionHash.toLowerCase() as `0x${string}`)
      : capture.transactionHash;
  return { ...capture, transactionHash };
}

export function sessionExpiredAtObservation(
  state: Pick<AltanaTestActionPublicState, "observedAt" | "sessionExpiry">
): boolean {
  if (state.sessionExpiry === null) return false;
  const observedAtMilliseconds = Date.parse(state.observedAt);
  return (
    Number.isFinite(observedAtMilliseconds) && state.sessionExpiry * 1_000 <= observedAtMilliseconds
  );
}

async function withRelayCapture<T>(operation: () => Promise<T>): Promise<{
  readonly result: T;
  readonly capture: RelayCapture;
}> {
  const originalFetch = window.fetch.bind(window);
  let capture: RelayCapture = { callsId: null, transactionHash: null };
  window.fetch = async (input, init) => {
    const bodyPromise = requestBody(input, init);
    const response = await originalFetch(input, init);
    try {
      if (new URL(requestUrl(input)).origin !== RELAY_ORIGIN) return response;
      const body = await bodyPromise;
      if (body === null || body.length > 2_000_000) return response;
      const request = JSON.parse(body) as unknown;
      if (typeof request !== "object" || request === null || Array.isArray(request))
        return response;
      const method = (request as { readonly method?: unknown }).method;
      if (!isPublicRelayEvidenceMethod(method)) return response;
      const responseBody = (await response.clone().json()) as unknown;
      if (
        typeof responseBody !== "object" ||
        responseBody === null ||
        Array.isArray(responseBody)
      ) {
        return response;
      }
      capture = publicRelayResult(
        method,
        (responseBody as { readonly result?: unknown }).result,
        capture
      );
    } catch {
      // Receipt capture is best-effort and never changes the SDK result.
    }
    return response;
  };
  try {
    try {
      return { result: await operation(), capture };
    } catch (error) {
      throw new RelayCapturedError(error, capture);
    }
  } finally {
    window.fetch = originalFetch;
  }
}

function isUserRejection(error: unknown): boolean {
  const candidate = error instanceof RelayCapturedError ? error.original : error;
  return (
    candidate instanceof DOMException &&
    (candidate.name === "NotAllowedError" || candidate.name === "AbortError")
  );
}

function capturedFromError(error: unknown): RelayCapture {
  return error instanceof RelayCapturedError
    ? error.capture
    : { callsId: null, transactionHash: null };
}

function explorerTransaction(hash: string): string {
  return `https://testnet.bscscan.com/tx/${hash}`;
}

export function AltanaSessionCeremony({
  config: unparsedConfig,
  rpId
}: AltanaSessionCeremonyProps) {
  const config = altanaTestActionConfigSchema.parse(unparsedConfig);
  const walletState = useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener("storage", onStoreChange);
      window.addEventListener(PASSKEY_WALLET_EVENT, onStoreChange);
      return () => {
        window.removeEventListener("storage", onStoreChange);
        window.removeEventListener(PASSKEY_WALLET_EVENT, onStoreChange);
      };
    },
    () => walletSnapshot(rpId),
    () => "server"
  );
  const operationState = useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener("storage", onStoreChange);
      window.addEventListener(OPERATION_EVENT, onStoreChange);
      return () => {
        window.removeEventListener("storage", onStoreChange);
        window.removeEventListener(OPERATION_EVENT, onStoreChange);
      };
    },
    () => operationSnapshot(config),
    () => "server"
  );
  const [worker, setWorker] = useState<WorkerResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const wallet = parseWallet(walletState);
  const operation = parseOperation(operationState);

  const refreshWorker = useCallback(async () => {
    try {
      const response = await fetch("/api/operator-ceremony/altana-state", { cache: "no-store" });
      const value = (await response.json()) as unknown;
      if (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        (value as { readonly availability?: unknown }).availability === "available"
      ) {
        const state = altanaTestActionPublicStateSchema.safeParse(
          (value as { readonly state?: unknown }).state
        );
        setWorker(
          state.success
            ? { availability: "available", state: state.data }
            : { availability: "unavailable", reason: "invalid_public_state" }
        );
        return;
      }
      const candidateReason =
        typeof value === "object" && value !== null && !Array.isArray(value) && "reason" in value
          ? value.reason
          : null;
      const reason = [
        "runtime_not_configured",
        "worker_not_started",
        "invalid_public_state"
      ].includes(String(candidateReason))
        ? (candidateReason as
            "runtime_not_configured" | "worker_not_started" | "invalid_public_state")
        : "invalid_public_state";
      setWorker({ availability: "unavailable", reason });
    } catch {
      setWorker({ availability: "unavailable", reason: "invalid_public_state" });
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refreshWorker(), 0);
    const timer = window.setInterval(() => void refreshWorker(), 4_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [refreshWorker]);

  const unboundWorkerState = worker?.availability === "available" ? worker.state : null;
  const workerState =
    unboundWorkerState?.walletAddress === config.walletAddress &&
    unboundWorkerState.sessionKeyAddress === config.sessionKey.address
      ? unboundWorkerState
      : null;
  const walletMatches = wallet?.address === config.walletAddress;
  const funded =
    workerState?.balanceWei !== null &&
    workerState?.balanceWei !== undefined &&
    BigInt(workerState.balanceWei) >= BigInt(config.minimumNativeBalanceWei);
  const authorityPresent = workerState?.authorityPresent === true;
  const executeConfirmed =
    workerState?.status === "execute_confirmed" || workerState?.status === "lifecycle_complete";
  const executeFailed = workerState?.status === "execute_failed";
  const lifecycleComplete = workerState?.status === "lifecycle_complete";
  const sessionExpired = workerState === null ? false : sessionExpiredAtObservation(workerState);
  const canGrant =
    walletMatches &&
    funded &&
    workerState?.status === "waiting_authority" &&
    operation === null &&
    !authorityPresent &&
    !busy;
  const canRevoke =
    walletMatches && authorityPresent && operation !== null && operation.revoke === null && !busy;

  async function grant(event: MouseEvent<HTMLButtonElement>) {
    if (!canGrant || wallet === null) return;
    setBusy(true);
    setMessage("Requesting Windows Hello for the exact chain-97 grant…");
    const eventEpochMilliseconds =
      event.timeStamp > 1_000_000_000_000
        ? event.timeStamp
        : performance.timeOrigin + event.timeStamp;
    const nowSeconds = Math.floor(eventEpochMilliseconds / 1_000);
    const intent = createAltanaTestActionGrantIntent(config, wallet.address, nowSeconds);
    const initial: BrowserOperation = {
      schemaVersion: 1,
      walletAddress: wallet.address,
      sessionPublicKey: config.sessionKey.publicKey,
      status: "grant_submitting",
      intent,
      grant: { callsId: null, transactionHash: null },
      revoke: null,
      updatedAt: new Date().toISOString()
    };
    retainOperation(initial);
    try {
      const { BNB_TESTNET, createClient, signerFromPasskey } = await import("@altananetwork/sdk");
      const client = createClient({ chains: [BNB_TESTNET], defaultChainId: 97 });
      const signer = signerFromPasskey(wallet.credential);
      const grantOptions = {
        wallet: { address: wallet.address },
        signer,
        chainId: 97,
        permissions: {
          calls: intent.permissions.calls,
          spend: intent.permissions.spend.map(({ limit, period }) => ({
            limit: BigInt(limit),
            period
          }))
        },
        expiry: intent.expiry,
        sessionSigner: createPublicOnlySessionSigner(intent.sessionKey),
        register: true
      } as const;
      const { capture } = await withRelayCapture(() => client.grantSession(grantOptions));
      retainOperation({
        ...initial,
        status: "grant_confirmed_probe_required",
        grant: capture,
        updatedAt: new Date().toISOString()
      });
      setMessage(
        "The relay reports a confirmed grant. The worker will wait until both RPCs observe the authority."
      );
      await refreshWorker();
    } catch (error) {
      if (isUserRejection(error)) {
        window.localStorage.removeItem(OPERATION_STORAGE_KEY);
        window.dispatchEvent(new Event(OPERATION_EVENT));
        setMessage("Windows Hello was cancelled; no grant or transaction was recorded.");
      } else {
        const retained = readBrowserOperation(config) ?? initial;
        retainOperation({
          ...retained,
          status: "grant_outcome_unknown",
          grant: capturedFromError(error),
          updatedAt: new Date().toISOString()
        });
        setMessage(
          "The grant outcome is unknown. Retries are locked while public authority and receipt evidence are reconciled."
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!canRevoke || wallet === null || operation === null) return;
    setBusy(true);
    setMessage("Requesting a separate Windows Hello confirmation for revocation…");
    const submitting: BrowserOperation = {
      ...operation,
      status: "revoke_submitting",
      revoke: { callsId: null, transactionHash: null },
      updatedAt: new Date().toISOString()
    };
    retainOperation(submitting);
    try {
      const { BNB_TESTNET, createClient, signerFromPasskey } = await import("@altananetwork/sdk");
      const client = createClient({ chains: [BNB_TESTNET], defaultChainId: 97 });
      const signer = signerFromPasskey(wallet.credential);
      const { capture } = await withRelayCapture(() =>
        client.revokeSession({
          wallet: { address: wallet.address },
          signer,
          session: config.sessionKey.publicKey,
          chainId: 97
        })
      );
      retainOperation({
        ...submitting,
        status: "revoke_confirmed_probe_required",
        revoke: capture,
        updatedAt: new Date().toISOString()
      });
      setMessage(
        "The relay processed the revocation. Completion appears only after the worker observes that authority is absent."
      );
      await refreshWorker();
    } catch (error) {
      if (isUserRejection(error)) {
        retainOperation(operation);
        setMessage("Windows Hello was cancelled; current authority is not inferred to be revoked.");
      } else {
        const retained = readBrowserOperation(config) ?? submitting;
        retainOperation({
          ...retained,
          status: "revoke_outcome_unknown",
          revoke: capturedFromError(error),
          updatedAt: new Date().toISOString()
        });
        setMessage(
          "The revocation outcome is unknown. No blind retry is allowed; public authority probing continues."
        );
      }
    } finally {
      setBusy(false);
    }
  }

  const executeHash = workerState?.execute?.transactionHash ?? null;
  const grantHash = operation?.grant.transactionHash ?? null;
  const revokeHash = operation?.revoke?.transactionHash ?? null;

  return (
    <section className="ceremony-passkey" aria-labelledby="altana-session-heading">
      <div className="ceremony-passkey-heading">
        <div>
          <span className="panel-overline">ALTANA SESSION / BSC TESTNET 97</span>
          <h3 id="altana-session-heading">Grant → PTA test action → revoke</h3>
        </div>
        <span className={`state-badge ${lifecycleComplete ? "state-positive" : "state-caution"}`}>
          {lifecycleComplete ? "Lifecycle complete" : (workerState?.status ?? "Checking worker")}
        </span>
      </div>

      <div className="ceremony-command" aria-label="Exact Altana test action policy">
        <span>Exact permission</span>
        <code>chain 97 · PTA approve(address,uint256) · amount 0 · value 0</code>
        <code>target {config.action.target}</code>
        <code>
          session {config.sessionKey.address} · 1-hour expiry · native fee cap{" "}
          {config.permissions.spend[0].limit} wei/day (0.0005 tBNB)
        </code>
      </div>

      <p aria-live="polite" role="status">
        {message ??
          (lifecycleComplete
            ? "The execution receipt is confirmed and neither RPC observes session authority."
            : !walletMatches
              ? `This flow accepts only passkey wallet ${config.walletAddress}.`
              : !funded
                ? `The wallet balance is ${workerState?.balanceWei ?? "unknown"} wei; at least ${config.minimumNativeBalanceWei} wei of tBNB is required to register both keys and pay gas.`
                : executeFailed
                  ? `The relay ended the test action with failure status ${workerState.execute?.relayStatusCode ?? "unknown"}; without a receipt there is no successful-execution claim.`
                  : sessionExpired && !authorityPresent
                    ? "The session expired and neither RPC observes authority. No revocation is needed; without an execution receipt the lifecycle remains incomplete."
                    : authorityPresent
                      ? executeConfirmed
                        ? "The test action has a receipt; revocation requires a separate Windows Hello confirmation."
                        : "Authority is active but execution has no receipt; you may revoke immediately. The lifecycle remains incomplete unless execution is confirmed."
                      : operation !== null
                        ? "The grant was submitted or is being reconciled; retries remain locked until authority is known."
                        : "The worker and funding are ready; the grant requires one Windows Hello confirmation.")}
      </p>

      <div className="ceremony-passkey-actions">
        <button
          className="button button-primary"
          disabled={!canGrant}
          onClick={grant}
          type="button"
        >
          {busy
            ? "Processing…"
            : authorityPresent
              ? "Authority observed"
              : "Grant testnet authority"}
        </button>
        <button
          className="button button-secondary"
          disabled={!canRevoke}
          onClick={revoke}
          type="button"
        >
          {lifecycleComplete
            ? "Revoked"
            : sessionExpired && !authorityPresent
              ? "Authority expired"
              : "Revoke session"}
        </button>
      </div>

      {worker?.availability === "unavailable" ? (
        <p className="registry-footnote">Worker public state unavailable: {worker.reason}.</p>
      ) : null}
      {unboundWorkerState !== null && workerState === null ? (
        <p className="registry-footnote">
          Public worker state does not match the pinned wallet and session.
        </p>
      ) : null}
      {workerState?.error === undefined ? null : (
        <p className="registry-footnote">
          The worker stopped safely with code {workerState.error}.
        </p>
      )}

      <dl className="ceremony-session-meta">
        <div>
          <dt>Wallet</dt>
          <dd>{config.walletAddress}</dd>
        </div>
        <div>
          <dt>Worker signer</dt>
          <dd>{config.sessionKey.address}</dd>
        </div>
        <div>
          <dt>Authority</dt>
          <dd>
            {authorityPresent
              ? "present"
              : lifecycleComplete
                ? "absent after revoke"
                : "not observed"}
          </dd>
        </div>
        <div>
          <dt>Execution</dt>
          <dd>{workerState?.status ?? "unavailable"}</dd>
        </div>
        <div>
          <dt>Relay status</dt>
          <dd>{workerState?.execute?.relayStatusCode ?? "unavailable"}</dd>
        </div>
      </dl>

      {[grantHash, executeHash, revokeHash].every((hash) => hash === null) ? null : (
        <div className="ceremony-passkey-wallet">
          {grantHash === null ? null : (
            <a href={explorerTransaction(grantHash)} rel="noreferrer" target="_blank">
              Grant receipt
            </a>
          )}
          {executeHash === null ? null : (
            <a href={explorerTransaction(executeHash)} rel="noreferrer" target="_blank">
              Execute receipt
            </a>
          )}
          {revokeHash === null ? null : (
            <a href={explorerTransaction(revokeHash)} rel="noreferrer" target="_blank">
              Revoke receipt
            </a>
          )}
        </div>
      )}

      <p className="registry-footnote">
        PTA is a fixed-supply test asset with no economic value. Selector-level permission cannot
        constrain arguments, so the worker signs only the pinned amount-0 calldata and the session
        expires after one hour. Without a receipt, there is no completion claim.
      </p>
    </section>
  );
}
